const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List samples
router.get('/', requireAuth, (req, res) => {
  const status = req.query.status || '';
  let query = `
    SELECT s.*, lo.order_number, p.first_name, p.last_name, p.patient_id as pid
    FROM samples s
    JOIN lab_orders lo ON s.order_id = lo.id
    JOIN patients p ON lo.patient_id = p.id
  `;
  const params = [];
  if (status) {
    query += ' WHERE s.status = ?';
    params.push(status);
  }
  query += ' ORDER BY s.created_at DESC';

  const samples = db.prepare(query).all(...params);
  res.render('pages/samples/list', { samples, status });
});

// Update sample status
router.post('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE samples SET status = ? WHERE id = ?').run(status, req.params.id);

  // If sample is processing, update order status too
  const sample = db.prepare('SELECT order_id FROM samples WHERE id = ?').get(req.params.id);
  if (sample) {
    db.prepare("UPDATE lab_orders SET status = 'in_progress', updated_at = datetime('now') WHERE id = ? AND status = 'pending'").run(sample.order_id);
  }

  res.redirect(req.get('Referer') || '/samples');
});

module.exports = router;
