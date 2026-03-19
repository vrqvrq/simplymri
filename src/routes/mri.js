const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List MRI studies
router.get('/', requireAuth, (req, res) => {
  const status = req.query.status || '';
  let query = `
    SELECT ms.*, p.first_name, p.last_name, p.patient_id as pid,
      (SELECT COUNT(*) FROM mri_images WHERE study_id = ms.id) as image_count,
      (SELECT report_status FROM mri_reports WHERE study_id = ms.id LIMIT 1) as report_status
    FROM mri_studies ms
    JOIN patients p ON ms.patient_id = p.id
  `;
  const params = [];
  if (status) {
    query += ' WHERE ms.status = ?';
    params.push(status);
  }
  query += ' ORDER BY ms.created_at DESC';

  const studies = db.prepare(query).all(...params);
  res.render('pages/mri/list', { studies, status });
});

// New MRI study form
router.get('/new', requireAuth, (req, res) => {
  const patients = db.prepare('SELECT id, patient_id, first_name, last_name FROM patients ORDER BY last_name').all();
  res.render('pages/mri/form', { patients, study: null, error: null });
});

// Create MRI study
router.post('/', requireAuth, (req, res) => {
  const { patient_id, ordering_physician, body_part, modality, contrast, clinical_indication, priority, scheduled_date, scanner, notes } = req.body;

  const count = db.prepare('SELECT COUNT(*) as count FROM mri_studies').get().count;
  const study_id = 'MRI-' + String(count + 1).padStart(6, '0');

  try {
    const result = db.prepare(`
      INSERT INTO mri_studies (study_id, patient_id, ordering_physician, body_part, modality, contrast, clinical_indication, priority, status, scheduled_date, scanner, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
    `).run(study_id, patient_id, ordering_physician, body_part, modality || 'MRI', contrast || 'without', clinical_indication, priority || 'routine', scheduled_date, scanner, notes, req.session.user.id);

    res.locals.audit('Created MRI study', 'mri_study', study_id, `Patient ${patient_id}, ${body_part}`);
    res.redirect(`/mri/${result.lastInsertRowid}`);
  } catch (err) {
    const patients = db.prepare('SELECT id, patient_id, first_name, last_name FROM patients ORDER BY last_name').all();
    res.render('pages/mri/form', { patients, study: req.body, error: err.message });
  }
});

// View MRI study
router.get('/:id', requireAuth, (req, res) => {
  const study = db.prepare(`
    SELECT ms.*, p.first_name, p.last_name, p.patient_id as pid, p.date_of_birth, p.gender
    FROM mri_studies ms
    JOIN patients p ON ms.patient_id = p.id
    WHERE ms.id = ?
  `).get(req.params.id);

  if (!study) return res.status(404).send('Study not found');

  const images = db.prepare('SELECT * FROM mri_images WHERE study_id = ? ORDER BY series_number, image_number').all(study.id);
  const report = db.prepare('SELECT * FROM mri_reports WHERE study_id = ?').get(study.id);

  // Group images by series
  const series = {};
  images.forEach(img => {
    const key = `${img.series_number}-${img.series_description}`;
    if (!series[key]) series[key] = { number: img.series_number, description: img.series_description, images: [] };
    series[key].images.push(img);
  });

  res.render('pages/mri/view', { study, images, report, series: Object.values(series) });
});

// Update MRI study status
router.post('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const updates = { status };
  if (status === 'completed') {
    db.prepare("UPDATE mri_studies SET status = ?, performed_date = datetime('now'), performed_by = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, req.session.user.id, req.params.id);
  } else {
    db.prepare("UPDATE mri_studies SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, req.params.id);
  }
  res.redirect(`/mri/${req.params.id}`);
});

// Create/update MRI report
router.post('/:id/report', requireAuth, (req, res) => {
  const { findings, impression, technique, comparison, recommendations, radiologist, report_status } = req.body;
  const study = db.prepare('SELECT id FROM mri_studies WHERE id = ?').get(req.params.id);
  if (!study) return res.status(404).send('Study not found');

  const existing = db.prepare('SELECT id FROM mri_reports WHERE study_id = ?').get(study.id);
  if (existing) {
    db.prepare(`
      UPDATE mri_reports SET findings = ?, impression = ?, technique = ?, comparison = ?, recommendations = ?, radiologist = ?,
        report_status = ?, reported_by = ?, reported_at = datetime('now')
      WHERE id = ?
    `).run(findings, impression, technique, comparison, recommendations, radiologist, report_status || 'draft', req.session.user.id, existing.id);

    if (report_status === 'final') {
      db.prepare("UPDATE mri_reports SET verified_by = ?, verified_at = datetime('now') WHERE id = ?")
        .run(req.session.user.id, existing.id);
    }
  } else {
    db.prepare(`
      INSERT INTO mri_reports (study_id, findings, impression, technique, comparison, recommendations, radiologist, report_status, reported_by, reported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(study.id, findings, impression, technique, comparison, recommendations, radiologist, report_status || 'draft', req.session.user.id);

    if (report_status === 'final') {
      const rpt = db.prepare('SELECT id FROM mri_reports WHERE study_id = ?').get(study.id);
      if (rpt) {
        db.prepare("UPDATE mri_reports SET verified_by = ?, verified_at = datetime('now') WHERE id = ?")
          .run(req.session.user.id, rpt.id);
      }
    }
  }

  res.locals.audit('Updated MRI report', 'mri_report', req.params.id, `Status: ${report_status}`);
  res.redirect(`/mri/${req.params.id}`);
});

// PACS Viewer for staff/doctors
router.get('/:id/viewer', requireAuth, (req, res) => {
  const study = db.prepare(`
    SELECT ms.*, p.first_name, p.last_name, p.patient_id as pid, p.date_of_birth, p.gender
    FROM mri_studies ms
    JOIN patients p ON ms.patient_id = p.id
    WHERE ms.id = ?
  `).get(req.params.id);

  if (!study) return res.status(404).send('Study not found');

  const report = db.prepare('SELECT * FROM mri_reports WHERE study_id = ?').get(study.id);

  const images = db.prepare(`
    SELECT * FROM mri_images WHERE study_id = ? ORDER BY series_number, image_number
  `).all(study.id);

  const series = {};
  images.forEach(img => {
    const key = `${img.series_number}-${img.series_description}`;
    if (!series[key]) series[key] = { number: img.series_number, description: img.series_description, images: [] };
    series[key].images.push(img);
  });

  // For staff PACS, we pass patient info from the study join
  const patient = {
    first_name: study.first_name,
    last_name: study.last_name,
    patient_id: study.pid
  };

  res.render('pages/portal/pacs-viewer', { patient, study, report, images, series: Object.values(series) });
});

module.exports = router;
