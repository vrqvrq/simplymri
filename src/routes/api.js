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

// Patient result history for graphing
router.get('/patients/:id/history', requireAuth, (req, res) => {
  const testCode = req.query.test || '';
  let history;
  if (testCode) {
    history = db.prepare(`
      SELECT tr.result_numeric, tr.result_value, tr.performed_at, tr.flag,
        tc.code, tc.name as test_name, tc.unit, tc.reference_range_min, tc.reference_range_max,
        lo.order_number
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      WHERE lo.patient_id = ? AND tc.code = ? AND tr.result_numeric IS NOT NULL
      ORDER BY tr.performed_at ASC
    `).all(req.params.id, testCode);
  } else {
    history = db.prepare(`
      SELECT DISTINCT tc.code, tc.name as test_name
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      WHERE lo.patient_id = ? AND tr.result_numeric IS NOT NULL
      ORDER BY tc.name
    `).all(req.params.id);
  }
  res.json(history);
});

// Patient timeline
router.get('/patients/:id/timeline', requireAuth, (req, res) => {
  const events = [];

  // Orders
  const orders = db.prepare(`
    SELECT 'order' as type, lo.order_number as title, lo.status, lo.priority, lo.created_at as date, lo.id
    FROM lab_orders lo WHERE lo.patient_id = ? ORDER BY lo.created_at DESC
  `).all(req.params.id);
  events.push(...orders);

  // Results
  const results = db.prepare(`
    SELECT 'result' as type, tc.name || ' = ' || tr.result_value || ' ' || COALESCE(tr.unit, '') as title,
      tr.flag as status, tr.performed_at as date, lo.id as order_id
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    JOIN lab_orders lo ON tr.order_id = lo.id
    WHERE lo.patient_id = ? AND tr.result_value IS NOT NULL
    ORDER BY tr.performed_at DESC
  `).all(req.params.id);
  events.push(...results);

  // Invoices
  const invoices = db.prepare(`
    SELECT 'invoice' as type, i.invoice_number || ' - $' || printf('%.2f', i.total) as title,
      i.status, i.created_at as date, i.id
    FROM invoices i WHERE i.patient_id = ? ORDER BY i.created_at DESC
  `).all(req.params.id);
  events.push(...invoices);

  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  res.json(events);
});

// Critical alerts
router.get('/critical-alerts', requireAuth, (req, res) => {
  const alerts = db.prepare(`
    SELECT ca.*, p.first_name, p.last_name, p.patient_id as pid, lo.order_number
    FROM critical_alerts ca
    JOIN patients p ON ca.patient_id = p.id
    JOIN lab_orders lo ON ca.order_id = lo.id
    ORDER BY ca.created_at DESC LIMIT 50
  `).all();
  res.json(alerts);
});

// Acknowledge critical alert
router.post('/critical-alerts/:id/ack', requireAuth, (req, res) => {
  db.prepare("UPDATE critical_alerts SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now') WHERE id = ?")
    .run(req.session.user.id, req.params.id);
  res.locals.audit('Acknowledged critical alert', 'critical_alert', req.params.id, '');
  res.json({ ok: true });
});

// Notifications
router.get('/notifications', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id IS NULL OR user_id = ?
    ORDER BY created_at DESC LIMIT 30
  `).all(req.session.user.id);
  const unread = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE (user_id IS NULL OR user_id = ?) AND read = 0
  `).get(req.session.user.id).count;
  res.json({ notifications, unread });
});

// Mark notification read
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Mark all notifications read
router.post('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id IS NULL OR user_id = ?').run(req.session.user.id);
  res.json({ ok: true });
});

// Summary reports data
router.get('/summary-report', requireAuth, (req, res) => {
  const period = req.query.period || 'today';
  let daysBack;
  switch (period) {
    case 'today': daysBack = 0; break;
    case 'week': daysBack = 7; break;
    case 'month': daysBack = 30; break;
    case 'year': daysBack = 365; break;
    default: daysBack = 0;
  }

  // Compute cutoff date in JS to avoid SQL string interpolation
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const dateParam = cutoff.toISOString().split('T')[0];

  const report = {
    period,
    orders: {
      total: db.prepare(`SELECT COUNT(*) as c FROM lab_orders WHERE date(created_at) >= ?`)
        .get(dateParam).c,
      byStatus: db.prepare(`SELECT status, COUNT(*) as count FROM lab_orders WHERE date(created_at) >= ? GROUP BY status`)
        .all(dateParam),
      byPriority: db.prepare(`SELECT priority, COUNT(*) as count FROM lab_orders WHERE date(created_at) >= ? GROUP BY priority`)
        .all(dateParam)
    },
    tests: {
      total: db.prepare(`SELECT COUNT(*) as c FROM test_results tr JOIN lab_orders lo ON tr.order_id = lo.id WHERE date(lo.created_at) >= ?`)
        .get(dateParam).c,
      completed: db.prepare(`SELECT COUNT(*) as c FROM test_results tr JOIN lab_orders lo ON tr.order_id = lo.id WHERE tr.status IN ('completed','verified') AND date(lo.created_at) >= ?`)
        .get(dateParam).c,
      abnormal: db.prepare(`SELECT COUNT(*) as c FROM test_results tr JOIN lab_orders lo ON tr.order_id = lo.id WHERE tr.flag IN ('HIGH','LOW') AND date(lo.created_at) >= ?`)
        .get(dateParam).c,
      byCategory: db.prepare(`SELECT tc.category, COUNT(*) as count FROM test_results tr JOIN test_catalog tc ON tr.test_id = tc.id JOIN lab_orders lo ON tr.order_id = lo.id WHERE date(lo.created_at) >= ? GROUP BY tc.category`)
        .all(dateParam)
    },
    revenue: {
      total: db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE date(created_at) >= ?`)
        .get(dateParam).t,
      paid: db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'paid' AND date(created_at) >= ?`)
        .get(dateParam).t,
      unpaid: db.prepare(`SELECT COALESCE(SUM(total), 0) as t FROM invoices WHERE status = 'unpaid' AND date(created_at) >= ?`)
        .get(dateParam).t
    },
    patients: {
      newPatients: db.prepare(`SELECT COUNT(*) as c FROM patients WHERE date(created_at) >= ?`)
        .get(dateParam).c
    },
    tat: db.prepare(`
      SELECT tc.name, tc.turnaround_hours as target,
        ROUND(AVG((julianday(tr.performed_at) - julianday(lo.created_at)) * 24), 1) as avg_hours,
        MIN(ROUND((julianday(tr.performed_at) - julianday(lo.created_at)) * 24, 1)) as min_hours,
        MAX(ROUND((julianday(tr.performed_at) - julianday(lo.created_at)) * 24, 1)) as max_hours,
        COUNT(*) as count
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      JOIN lab_orders lo ON tr.order_id = lo.id
      WHERE tr.performed_at IS NOT NULL AND date(lo.created_at) >= ?
      GROUP BY tr.test_id ORDER BY count DESC
    `).all(dateParam)
  };

  res.json(report);
});

// Amend a result
router.post('/results/:id/amend', requireAuth, (req, res) => {
  const { new_value, reason } = req.body;
  if (!new_value || !reason) return res.status(400).json({ error: 'Value and reason required' });

  const result = db.prepare('SELECT * FROM test_results WHERE id = ?').get(req.params.id);
  if (!result) return res.status(404).json({ error: 'Result not found' });

  const amend = db.transaction(() => {
    // Record amendment
    db.prepare('INSERT INTO result_amendments (result_id, previous_value, new_value, reason, amended_by) VALUES (?, ?, ?, ?, ?)')
      .run(result.id, result.result_value, new_value, reason, req.session.user.id);

    // Update result
    const numVal = parseFloat(new_value);
    let flag = null;
    const test = db.prepare('SELECT * FROM test_catalog WHERE id = ?').get(result.test_id);
    if (!isNaN(numVal) && test) {
      if (test.reference_range_min !== null && numVal < test.reference_range_min) flag = 'LOW';
      else if (test.reference_range_max !== null && numVal > test.reference_range_max) flag = 'HIGH';
      else flag = 'NORMAL';
    }

    db.prepare('UPDATE test_results SET result_value = ?, result_numeric = ?, flag = ? WHERE id = ?')
      .run(new_value, isNaN(numVal) ? null : numVal, flag, result.id);
  });

  amend();
  res.locals.audit('Amended result', 'test_result', String(result.id), `Changed from "${result.result_value}" to "${new_value}" - Reason: ${reason}`);
  res.json({ ok: true });
});

// Get amendments for a result
router.get('/results/:id/amendments', requireAuth, (req, res) => {
  const amendments = db.prepare(`
    SELECT ra.*, u.full_name as amended_by_name
    FROM result_amendments ra
    JOIN users u ON ra.amended_by = u.id
    WHERE ra.result_id = ?
    ORDER BY ra.created_at DESC
  `).all(req.params.id);
  res.json(amendments);
});

module.exports = router;
