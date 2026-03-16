const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List orders
router.get('/', requireAuth, (req, res) => {
  const status = req.query.status || '';
  let query = `
    SELECT lo.*, p.first_name, p.last_name, p.patient_id as pid
    FROM lab_orders lo
    JOIN patients p ON lo.patient_id = p.id
  `;
  const params = [];
  if (status) {
    query += ' WHERE lo.status = ?';
    params.push(status);
  }
  query += ' ORDER BY lo.created_at DESC';

  const orders = db.prepare(query).all(...params);
  res.render('pages/orders/list', { orders, status });
});

// New order form
router.get('/new', requireAuth, (req, res) => {
  const patients = db.prepare('SELECT id, patient_id, first_name, last_name FROM patients ORDER BY last_name').all();
  const tests = db.prepare('SELECT * FROM test_catalog WHERE active = 1 ORDER BY category, name').all();
  const selectedPatient = req.query.patient_id || '';
  res.render('pages/orders/form', { patients, tests, order: null, error: null, selectedPatient });
});

// Create order
router.post('/', requireAuth, (req, res) => {
  const { patient_id, ordering_physician, clinical_notes, priority, test_ids } = req.body;

  const count = db.prepare('SELECT COUNT(*) as count FROM lab_orders').get().count;
  const order_number = 'ORD' + String(count + 1).padStart(6, '0');

  const selectedTests = Array.isArray(test_ids) ? test_ids : (test_ids ? [test_ids] : []);

  if (selectedTests.length === 0) {
    const patients = db.prepare('SELECT id, patient_id, first_name, last_name FROM patients ORDER BY last_name').all();
    const tests = db.prepare('SELECT * FROM test_catalog WHERE active = 1 ORDER BY category, name').all();
    return res.render('pages/orders/form', { patients, tests, order: req.body, error: 'Please select at least one test', selectedPatient: patient_id });
  }

  const insertOrder = db.transaction(() => {
    // Create order
    const result = db.prepare(`
      INSERT INTO lab_orders (order_number, patient_id, ordering_physician, clinical_notes, priority, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(order_number, patient_id, ordering_physician, clinical_notes, priority || 'routine', req.session.user.id);

    const orderId = result.lastInsertRowid;

    // Determine sample types needed
    const sampleTypes = new Set();
    for (const testId of selectedTests) {
      const test = db.prepare('SELECT sample_type FROM test_catalog WHERE id = ?').get(testId);
      if (test) sampleTypes.add(test.sample_type);
    }

    // Create samples
    const sampleMap = {};
    let sampleCount = db.prepare('SELECT COUNT(*) as count FROM samples').get().count;
    for (const sampleType of sampleTypes) {
      sampleCount++;
      const sample_id = 'S' + String(sampleCount).padStart(7, '0');
      const sResult = db.prepare(`
        INSERT INTO samples (sample_id, order_id, sample_type, collected_by, status)
        VALUES (?, ?, ?, ?, 'collected')
      `).run(sample_id, orderId, sampleType, req.session.user.id);
      sampleMap[sampleType] = sResult.lastInsertRowid;
    }

    // Create test results (pending)
    for (const testId of selectedTests) {
      const test = db.prepare('SELECT * FROM test_catalog WHERE id = ?').get(testId);
      if (test) {
        db.prepare(`
          INSERT INTO test_results (sample_id, test_id, order_id, unit, reference_range, status)
          VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(sampleMap[test.sample_type], test.id, orderId, test.unit, test.reference_range_text);
      }
    }

    return orderId;
  });

  try {
    const orderId = insertOrder();
    res.redirect(`/orders/${orderId}`);
  } catch (err) {
    const patients = db.prepare('SELECT id, patient_id, first_name, last_name FROM patients ORDER BY last_name').all();
    const tests = db.prepare('SELECT * FROM test_catalog WHERE active = 1 ORDER BY category, name').all();
    res.render('pages/orders/form', { patients, tests, order: req.body, error: err.message, selectedPatient: patient_id });
  }
});

// View order
router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT lo.*, p.first_name, p.last_name, p.patient_id as pid, p.date_of_birth, p.gender
    FROM lab_orders lo
    JOIN patients p ON lo.patient_id = p.id
    WHERE lo.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).send('Order not found');

  const samples = db.prepare('SELECT * FROM samples WHERE order_id = ?').all(order.id);
  const results = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.reference_range_min, tc.reference_range_max
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    WHERE tr.order_id = ?
    ORDER BY tc.category, tc.name
  `).all(order.id);

  const invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order.id);

  res.render('pages/orders/view', { order, samples, results, invoice });
});

// Update order status
router.post('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE lab_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  res.redirect(`/orders/${req.params.id}`);
});

module.exports = router;
