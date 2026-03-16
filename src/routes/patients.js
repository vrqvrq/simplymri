const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List patients
router.get('/', requireAuth, (req, res) => {
  const search = req.query.search || '';
  let patients;
  if (search) {
    patients = db.prepare(`
      SELECT * FROM patients
      WHERE first_name LIKE ? OR last_name LIKE ? OR patient_id LIKE ? OR phone LIKE ?
      ORDER BY created_at DESC
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    patients = db.prepare('SELECT * FROM patients ORDER BY created_at DESC').all();
  }
  res.render('pages/patients/list', { patients, search });
});

// New patient form
router.get('/new', requireAuth, (req, res) => {
  res.render('pages/patients/form', { patient: null, error: null });
});

// Create patient
router.post('/', requireAuth, (req, res) => {
  const { first_name, last_name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_number, emergency_contact, emergency_phone, notes } = req.body;

  // Generate patient ID
  const count = db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
  const patient_id = 'P' + String(count + 1).padStart(6, '0');

  try {
    db.prepare(`
      INSERT INTO patients (patient_id, first_name, last_name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_number, emergency_contact, emergency_phone, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(patient_id, first_name, last_name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_number, emergency_contact, emergency_phone, notes);
    res.locals.audit('Created patient', 'patient', patient_id, `${first_name} ${last_name}`);
    res.redirect('/patients');
  } catch (err) {
    res.render('pages/patients/form', { patient: req.body, error: err.message });
  }
});

// View patient
router.get('/:id', requireAuth, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).send('Patient not found');

  const orders = db.prepare(`
    SELECT lo.*,
      (SELECT COUNT(*) FROM test_results tr WHERE tr.order_id = lo.id) as test_count
    FROM lab_orders lo WHERE lo.patient_id = ? ORDER BY lo.created_at DESC
  `).all(patient.id);

  const invoices = db.prepare('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at DESC').all(patient.id);

  res.render('pages/patients/view', { patient, orders, invoices });
});

// Edit patient form
router.get('/:id/edit', requireAuth, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).send('Patient not found');
  res.render('pages/patients/form', { patient, error: null });
});

// Update patient
router.post('/:id', requireAuth, (req, res) => {
  const { first_name, last_name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_number, emergency_contact, emergency_phone, notes } = req.body;

  try {
    db.prepare(`
      UPDATE patients SET first_name=?, last_name=?, date_of_birth=?, gender=?, phone=?, email=?, address=?, insurance_provider=?, insurance_number=?, emergency_contact=?, emergency_phone=?, notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(first_name, last_name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_number, emergency_contact, emergency_phone, notes, req.params.id);
    res.locals.audit('Updated patient', 'patient', req.params.id, `${first_name} ${last_name}`);
    res.redirect(`/patients/${req.params.id}`);
  } catch (err) {
    const patient = { id: req.params.id, ...req.body };
    res.render('pages/patients/form', { patient, error: err.message });
  }
});

module.exports = router;
