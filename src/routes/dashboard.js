const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const stats = {
    totalPatients: db.prepare('SELECT COUNT(*) as count FROM patients').get().count,
    pendingOrders: db.prepare("SELECT COUNT(*) as count FROM lab_orders WHERE status IN ('pending', 'in_progress')").get().count,
    completedToday: db.prepare("SELECT COUNT(*) as count FROM lab_orders WHERE status = 'completed' AND date(updated_at) = date('now')").get().count,
    unpaidInvoices: db.prepare("SELECT COUNT(*) as count FROM invoices WHERE status = 'unpaid'").get().count,
    totalRevenue: db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = 'paid'").get().total,
    pendingSamples: db.prepare("SELECT COUNT(*) as count FROM samples WHERE status IN ('collected', 'processing')").get().count
  };

  const recentOrders = db.prepare(`
    SELECT lo.*, p.first_name, p.last_name, p.patient_id as pid
    FROM lab_orders lo
    JOIN patients p ON lo.patient_id = p.id
    ORDER BY lo.created_at DESC LIMIT 10
  `).all();

  res.render('pages/dashboard', { stats, recentOrders });
});

module.exports = router;
