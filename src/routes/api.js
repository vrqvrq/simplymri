const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// Dashboard chart data API
router.get('/dashboard-stats', requireAuth, (req, res) => {
  // Orders by status
  const ordersByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM lab_orders GROUP BY status
  `).all();

  // Orders per day (last 14 days)
  const ordersPerDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM lab_orders
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at)
    ORDER BY day
  `).all();

  // Revenue per day (last 14 days)
  const revenuePerDay = db.prepare(`
    SELECT date(paid_at) as day, SUM(total) as revenue
    FROM invoices
    WHERE status = 'paid' AND paid_at >= datetime('now', '-14 days')
    GROUP BY date(paid_at)
    ORDER BY day
  `).all();

  // Tests by category
  const testsByCategory = db.prepare(`
    SELECT tc.category, COUNT(*) as count
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    GROUP BY tc.category
  `).all();

  // Abnormal results count
  const abnormalResults = db.prepare(`
    SELECT flag, COUNT(*) as count
    FROM test_results
    WHERE flag IS NOT NULL
    GROUP BY flag
  `).all();

  // Top tests ordered
  const topTests = db.prepare(`
    SELECT tc.name, tc.code, COUNT(*) as count
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    GROUP BY tr.test_id
    ORDER BY count DESC LIMIT 10
  `).all();

  // Monthly revenue (last 12 months)
  const monthlyRevenue = db.prepare(`
    SELECT strftime('%Y-%m', paid_at) as month, SUM(total) as revenue
    FROM invoices
    WHERE status = 'paid' AND paid_at >= datetime('now', '-12 months')
    GROUP BY strftime('%Y-%m', paid_at)
    ORDER BY month
  `).all();

  res.json({ ordersByStatus, ordersPerDay, revenuePerDay, testsByCategory, abnormalResults, topTests, monthlyRevenue });
});

// Audit log API
router.get('/audit-log', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;
  const logs = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});

// Patient search autocomplete
router.get('/patients/search', requireAuth, (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json([]);

  const results = db.prepare(`
    SELECT id, patient_id, first_name, last_name, date_of_birth, phone
    FROM patients
    WHERE first_name LIKE ? OR last_name LIKE ? OR patient_id LIKE ? OR phone LIKE ?
    ORDER BY last_name LIMIT 10
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);

  res.json(results);
});

module.exports = router;
