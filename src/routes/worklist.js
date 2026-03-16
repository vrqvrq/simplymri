const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// Technician worklist - shows pending work for current user or all
router.get('/', requireAuth, (req, res) => {
  const filter = req.query.filter || 'all';

  // Pending results needing entry
  let pendingResults;
  if (filter === 'mine') {
    pendingResults = db.prepare(`
      SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.turnaround_hours,
        lo.order_number, lo.priority, lo.created_at as order_date,
        p.first_name, p.last_name, p.patient_id as pid,
        s.sample_id, s.sample_type,
        ROUND((julianday('now') - julianday(lo.created_at)) * 24, 1) as hours_elapsed
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN samples s ON tr.sample_id = s.id
      WHERE tr.status = 'pending' AND tr.performed_by = ?
      ORDER BY lo.priority DESC, lo.created_at ASC
    `).all(req.session.user.id);
  } else {
    pendingResults = db.prepare(`
      SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.turnaround_hours,
        lo.order_number, lo.priority, lo.created_at as order_date,
        p.first_name, p.last_name, p.patient_id as pid,
        s.sample_id, s.sample_type,
        ROUND((julianday('now') - julianday(lo.created_at)) * 24, 1) as hours_elapsed
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      JOIN patients p ON lo.patient_id = p.id
      JOIN samples s ON tr.sample_id = s.id
      WHERE tr.status = 'pending'
      ORDER BY lo.priority DESC, lo.created_at ASC
    `).all();
  }

  // Results needing verification
  const pendingVerification = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name,
      lo.order_number, lo.priority,
      p.first_name, p.last_name, p.patient_id as pid,
      u.full_name as performed_by_name
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    JOIN patients p ON lo.patient_id = p.id
    LEFT JOIN users u ON tr.performed_by = u.id
    WHERE tr.status = 'completed'
    ORDER BY lo.priority DESC, tr.performed_at ASC
  `).all();

  // TAT stats
  const tatStats = db.prepare(`
    SELECT tc.name, tc.turnaround_hours as target,
      ROUND(AVG((julianday(tr.performed_at) - julianday(lo.created_at)) * 24), 1) as avg_tat,
      COUNT(*) as count
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE tr.performed_at IS NOT NULL
    GROUP BY tr.test_id
    ORDER BY count DESC LIMIT 10
  `).all();

  res.render('pages/worklist/index', { pendingResults, pendingVerification, tatStats, filter });
});

module.exports = router;
