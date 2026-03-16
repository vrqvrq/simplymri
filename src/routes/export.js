const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// Export patients CSV
router.get('/patients', requireAuth, (req, res) => {
  const patients = db.prepare('SELECT patient_id, first_name, last_name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_number, created_at FROM patients ORDER BY last_name').all();

  const headers = ['Patient ID', 'First Name', 'Last Name', 'DOB', 'Gender', 'Phone', 'Email', 'Address', 'Insurance', 'Insurance #', 'Registered'];
  const rows = patients.map(p => [p.patient_id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.phone || '', p.email || '', (p.address || '').replace(/,/g, ';'), p.insurance_provider || '', p.insurance_number || '', p.created_at]);

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(v => `"${v}"`).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=patients-export.csv');
  res.send(csv);
});

// Export orders CSV
router.get('/orders', requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT lo.order_number, p.patient_id, p.first_name, p.last_name, lo.ordering_physician, lo.priority, lo.status, lo.created_at, lo.updated_at
    FROM lab_orders lo
    JOIN patients p ON lo.patient_id = p.id
    ORDER BY lo.created_at DESC
  `).all();

  const headers = ['Order #', 'Patient ID', 'First Name', 'Last Name', 'Physician', 'Priority', 'Status', 'Created', 'Updated'];
  const rows = orders.map(o => [o.order_number, o.patient_id, o.first_name, o.last_name, o.ordering_physician || '', o.priority, o.status, o.created_at, o.updated_at]);

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(v => `"${v}"`).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=orders-export.csv');
  res.send(csv);
});

// Export results CSV
router.get('/results', requireAuth, (req, res) => {
  const results = db.prepare(`
    SELECT lo.order_number, p.patient_id, p.first_name, p.last_name, tc.code, tc.name as test_name, tc.category,
      tr.result_value, tr.unit, tr.reference_range, tr.flag, tr.status, tr.performed_at
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    JOIN patients p ON lo.patient_id = p.id
    ORDER BY lo.created_at DESC
  `).all();

  const headers = ['Order #', 'Patient ID', 'Patient Name', 'Test Code', 'Test Name', 'Category', 'Result', 'Unit', 'Reference', 'Flag', 'Status', 'Performed'];
  const rows = results.map(r => [r.order_number, r.patient_id, `${r.first_name} ${r.last_name}`, r.code, r.test_name, r.category, r.result_value || '', r.unit || '', r.reference_range || '', r.flag || '', r.status, r.performed_at || '']);

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(v => `"${v}"`).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=results-export.csv');
  res.send(csv);
});

// Export invoices CSV
router.get('/invoices', requireAuth, (req, res) => {
  const invoices = db.prepare(`
    SELECT i.invoice_number, lo.order_number, p.patient_id, p.first_name, p.last_name,
      i.subtotal, i.tax, i.discount, i.total, i.status, i.payment_method, i.paid_at, i.created_at
    FROM invoices i
    JOIN lab_orders lo ON i.order_id = lo.id
    JOIN patients p ON i.patient_id = p.id
    ORDER BY i.created_at DESC
  `).all();

  const headers = ['Invoice #', 'Order #', 'Patient ID', 'Patient Name', 'Subtotal', 'Tax', 'Discount', 'Total', 'Status', 'Payment Method', 'Paid At', 'Created'];
  const rows = invoices.map(i => [i.invoice_number, i.order_number, i.patient_id, `${i.first_name} ${i.last_name}`, i.subtotal, i.tax, i.discount, i.total, i.status, i.payment_method || '', i.paid_at || '', i.created_at]);

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(v => `"${v}"`).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=invoices-export.csv');
  res.send(csv);
});

// Export audit log CSV
router.get('/audit', requireAuth, (req, res) => {
  const logs = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC').all();

  const headers = ['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details', 'IP'];
  const rows = logs.map(l => [l.created_at, l.user_name, l.action, l.entity_type, l.entity_id || '', (l.details || '').replace(/,/g, ';'), l.ip_address || '']);

  let csv = headers.join(',') + '\n';
  for (const row of rows) {
    csv += row.map(v => `"${v}"`).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=audit-log-export.csv');
  res.send(csv);
});

module.exports = router;
