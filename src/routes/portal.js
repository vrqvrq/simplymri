const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Portal auth middleware
function requirePatient(req, res, next) {
  if (!req.session || !req.session.patient) {
    return res.redirect('/portal/login');
  }
  res.locals.patient = req.session.patient;
  next();
}

// Login page
router.get('/login', (req, res) => {
  res.render('pages/portal/login', { error: null });
});

// Login with Patient ID + DOB
router.post('/login', (req, res) => {
  const { patient_id, date_of_birth } = req.body;
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ? AND date_of_birth = ?').get(patient_id, date_of_birth);

  if (!patient) {
    return res.render('pages/portal/login', { error: 'Invalid Patient ID or Date of Birth. Please contact the lab if you need help.' });
  }

  req.session.patient = {
    id: patient.id,
    patient_id: patient.patient_id,
    first_name: patient.first_name,
    last_name: patient.last_name,
    email: patient.email,
    phone: patient.phone
  };

  res.redirect('/portal');
});

// Logout
router.get('/logout', (req, res) => {
  delete req.session.patient;
  res.redirect('/portal/login');
});

// Dashboard
router.get('/', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const recentResults = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.unit,
      lo.order_number, lo.created_at as order_date, lo.ordering_physician
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ? AND tr.status IN ('completed', 'verified') AND tr.result_value IS NOT NULL
    ORDER BY tr.performed_at DESC LIMIT 20
  `).all(req.session.patient.id);

  const pendingOrders = db.prepare(`
    SELECT lo.*, (SELECT COUNT(*) FROM test_results WHERE order_id = lo.id) as test_count,
      (SELECT COUNT(*) FROM test_results WHERE order_id = lo.id AND status IN ('completed','verified')) as done_count
    FROM lab_orders lo
    WHERE lo.patient_id = ? AND lo.status IN ('pending', 'in_progress')
    ORDER BY lo.created_at DESC
  `).all(req.session.patient.id);

  const completedOrders = db.prepare(`
    SELECT lo.*, (SELECT COUNT(*) FROM test_results WHERE order_id = lo.id) as test_count
    FROM lab_orders lo
    WHERE lo.patient_id = ? AND lo.status IN ('completed', 'verified')
    ORDER BY lo.created_at DESC LIMIT 10
  `).all(req.session.patient.id);

  const unpaidInvoices = db.prepare(`
    SELECT i.*, lo.order_number FROM invoices i
    JOIN lab_orders lo ON i.order_id = lo.id
    WHERE i.patient_id = ? AND i.status = 'unpaid'
    ORDER BY i.created_at DESC
  `).all(req.session.patient.id);

  const mriStudies = db.prepare(`
    SELECT ms.*,
      (SELECT report_status FROM mri_reports WHERE study_id = ms.id LIMIT 1) as report_status
    FROM mri_studies ms
    WHERE ms.patient_id = ?
    ORDER BY ms.created_at DESC LIMIT 5
  `).all(req.session.patient.id);

  res.render('pages/portal/dashboard', { patient, recentResults, pendingOrders, completedOrders, unpaidInvoices, mriStudies });
});

// View order results
router.get('/order/:id', requirePatient, (req, res) => {
  const order = db.prepare(`
    SELECT lo.* FROM lab_orders lo
    WHERE lo.id = ? AND lo.patient_id = ?
  `).get(req.params.id, req.session.patient.id);

  if (!order) return res.status(404).send('Order not found');

  const results = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.unit,
      tc.reference_range_text, tc.description as test_description
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    WHERE tr.order_id = ?
    ORDER BY tc.category, tc.name
  `).all(order.id);

  res.render('pages/portal/order', { order, results });
});

// Result history API for patient charts
router.get('/api/history', requirePatient, (req, res) => {
  const testCode = req.query.test || '';
  if (!testCode) {
    const tests = db.prepare(`
      SELECT DISTINCT tc.code, tc.name as test_name, tc.unit
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      WHERE lo.patient_id = ? AND tr.result_numeric IS NOT NULL
      ORDER BY tc.name
    `).all(req.session.patient.id);
    return res.json(tests);
  }

  const history = db.prepare(`
    SELECT tr.result_numeric, tr.result_value, tr.performed_at, tr.flag,
      tc.code, tc.name as test_name, tc.unit, tc.reference_range_min, tc.reference_range_max
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ? AND tc.code = ? AND tr.result_numeric IS NOT NULL
    ORDER BY tr.performed_at ASC
  `).all(req.session.patient.id, testCode);

  res.json(history);
});

// Download PDF report (reuse existing route logic)
router.get('/report/:orderId', requirePatient, (req, res) => {
  const order = db.prepare('SELECT * FROM lab_orders WHERE id = ? AND patient_id = ?').get(req.params.orderId, req.session.patient.id);
  if (!order) return res.status(404).send('Report not found');
  // Redirect to the existing report generator
  res.redirect(`/reports/lab-report/${req.params.orderId}`);
});

// Invoices
router.get('/invoices', requirePatient, (req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, lo.order_number FROM invoices i
    JOIN lab_orders lo ON i.order_id = lo.id
    WHERE i.patient_id = ?
    ORDER BY i.created_at DESC
  `).all(req.session.patient.id);

  res.render('pages/portal/invoices', { invoices });
});

// Profile
router.get('/profile', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);
  res.render('pages/portal/profile', { patient });
});

// MRI Studies list
router.get('/mri', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const studies = db.prepare(`
    SELECT ms.*,
      (SELECT COUNT(*) FROM mri_images WHERE study_id = ms.id) as image_count,
      (SELECT report_status FROM mri_reports WHERE study_id = ms.id LIMIT 1) as report_status
    FROM mri_studies ms
    WHERE ms.patient_id = ?
    ORDER BY ms.created_at DESC
  `).all(req.session.patient.id);

  res.render('pages/portal/mri-studies', { patient, studies });
});

// MRI Study detail with report and images
router.get('/mri/:id', requirePatient, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.session.patient.id);

  const study = db.prepare(`
    SELECT ms.* FROM mri_studies ms
    WHERE ms.id = ? AND ms.patient_id = ?
  `).get(req.params.id, req.session.patient.id);

  if (!study) return res.status(404).send('Study not found');

  const report = db.prepare(`
    SELECT * FROM mri_reports WHERE study_id = ? AND report_status = 'final'
  `).get(study.id);

  const images = db.prepare(`
    SELECT * FROM mri_images WHERE study_id = ? ORDER BY series_number, image_number
  `).all(study.id);

  // Group images by series
  const series = {};
  images.forEach(img => {
    const key = `${img.series_number}-${img.series_description}`;
    if (!series[key]) series[key] = { number: img.series_number, description: img.series_description, images: [] };
    series[key].images.push(img);
  });

  res.render('pages/portal/mri-detail', { patient, study, report, images, series: Object.values(series) });
});

// Education
router.get('/education', requirePatient, (req, res) => {
  // Fetch unique test categories and tests the patient has had
  const patientTests = db.prepare(`
    SELECT DISTINCT tc.code, tc.name as test_name, tc.category, tc.unit,
      tc.reference_range_text, tc.description as test_description
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ?
    ORDER BY tc.category, tc.name
  `).all(req.session.patient.id);

  res.render('pages/portal/education', { patientTests });
});

module.exports = router;
