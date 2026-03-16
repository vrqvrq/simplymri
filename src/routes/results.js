const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// Enter results for an order
router.get('/enter/:orderId', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT lo.*, p.first_name, p.last_name, p.patient_id as pid
    FROM lab_orders lo
    JOIN patients p ON lo.patient_id = p.id
    WHERE lo.id = ?
  `).get(req.params.orderId);

  if (!order) return res.status(404).send('Order not found');

  const results = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category, tc.reference_range_min, tc.reference_range_max, tc.unit as test_unit
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    WHERE tr.order_id = ?
    ORDER BY tc.category, tc.name
  `).all(order.id);

  res.render('pages/results/enter', { order, results, error: null });
});

// Save results
router.post('/save/:orderId', requireAuth, (req, res) => {
  const results = req.body.results || {};

  const saveResults = db.transaction(() => {
    for (const [resultId, data] of Object.entries(results)) {
      const result = db.prepare('SELECT tr.*, tc.reference_range_min, tc.reference_range_max FROM test_results tr JOIN test_catalog tc ON tr.test_id = tc.id WHERE tr.id = ?').get(resultId);

      let flag = null;
      const numericValue = parseFloat(data.value);
      if (!isNaN(numericValue) && result) {
        if (result.reference_range_min !== null && numericValue < result.reference_range_min) flag = 'LOW';
        else if (result.reference_range_max !== null && numericValue > result.reference_range_max) flag = 'HIGH';
        else flag = 'NORMAL';
      }

      db.prepare(`
        UPDATE test_results SET
          result_value = ?, result_numeric = ?, flag = ?, notes = ?,
          status = 'completed', performed_by = ?, performed_at = datetime('now')
        WHERE id = ?
      `).run(data.value, isNaN(numericValue) ? null : numericValue, flag, data.notes || null, req.session.user.id, resultId);

      // Check for critical values
      if (!isNaN(numericValue) && result) {
        const critical = db.prepare('SELECT * FROM critical_values WHERE test_id = ?').get(result.test_id);
        if (critical) {
          let criticalType = null;
          if (critical.critical_low !== null && numericValue <= critical.critical_low) criticalType = 'CRITICAL LOW';
          else if (critical.critical_high !== null && numericValue >= critical.critical_high) criticalType = 'CRITICAL HIGH';

          if (criticalType) {
            const order = db.prepare('SELECT patient_id FROM lab_orders WHERE id = ?').get(req.params.orderId);
            const test = db.prepare('SELECT name FROM test_catalog WHERE id = ?').get(result.test_id);
            db.prepare(`
              INSERT INTO critical_alerts (result_id, order_id, patient_id, test_name, result_value, critical_type)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(resultId, req.params.orderId, order.patient_id, test.name, data.value, criticalType);

            // Create in-app notification for all users
            db.prepare(`
              INSERT INTO notifications (user_id, type, title, message, link)
              VALUES (NULL, 'critical', ?, ?, ?)
            `).run(
              'CRITICAL: ' + test.name,
              `${criticalType} - Value: ${data.value} (${critical.action_required})`,
              '/orders/' + req.params.orderId
            );
          }
        }
      }
    }

    // Check if all results for this order are completed
    const pending = db.prepare("SELECT COUNT(*) as count FROM test_results WHERE order_id = ? AND status != 'completed'").get(req.params.orderId);
    if (pending.count === 0) {
      db.prepare("UPDATE lab_orders SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(req.params.orderId);
      db.prepare("UPDATE samples SET status = 'completed' WHERE order_id = ?").run(req.params.orderId);
    }
  });

  try {
    saveResults();
    res.locals.audit('Entered results', 'order', req.params.orderId, `${Object.keys(results).length} results saved`);
    res.redirect(`/orders/${req.params.orderId}`);
  } catch (err) {
    res.redirect(`/results/enter/${req.params.orderId}?error=${encodeURIComponent(err.message)}`);
  }
});

// Verify results
router.post('/verify/:orderId', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE test_results SET status = 'verified', verified_by = ?, verified_at = datetime('now')
    WHERE order_id = ? AND status = 'completed'
  `).run(req.session.user.id, req.params.orderId);

  db.prepare("UPDATE lab_orders SET status = 'verified', updated_at = datetime('now') WHERE id = ?").run(req.params.orderId);

  res.locals.audit('Verified results', 'order', req.params.orderId, 'Results verified');
  res.redirect(`/orders/${req.params.orderId}`);
});

module.exports = router;
