const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List invoices
router.get('/', requireAuth, (req, res) => {
  const status = req.query.status || '';
  let query = `
    SELECT i.*, p.first_name, p.last_name, p.patient_id as pid, lo.order_number
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    JOIN lab_orders lo ON i.order_id = lo.id
  `;
  const params = [];
  if (status) {
    query += ' WHERE i.status = ?';
    params.push(status);
  }
  query += ' ORDER BY i.created_at DESC';

  const invoices = db.prepare(query).all(...params);

  const totals = {
    unpaid: db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = 'unpaid'").get().total,
    paid: db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status = 'paid'").get().total
  };

  res.render('pages/billing/list', { invoices, status, totals });
});

// Generate invoice for an order
router.post('/generate/:orderId', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM lab_orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).send('Order not found');

  // Check if invoice already exists
  const existing = db.prepare('SELECT id FROM invoices WHERE order_id = ?').get(order.id);
  if (existing) return res.redirect(`/billing/${existing.id}`);

  const generateInvoice = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
    const invoice_number = 'INV' + String(count + 1).padStart(6, '0');

    const tests = db.prepare(`
      SELECT tr.test_id, tc.name, tc.price
      FROM test_results tr
      JOIN test_catalog tc ON tr.test_id = tc.id
      WHERE tr.order_id = ?
    `).all(order.id);

    const subtotal = tests.reduce((sum, t) => sum + t.price, 0);
    const tax = subtotal * 0.0; // No tax by default
    const total = subtotal + tax;

    const result = db.prepare(`
      INSERT INTO invoices (invoice_number, order_id, patient_id, subtotal, tax, discount, total, status)
      VALUES (?, ?, ?, ?, ?, 0, ?, 'unpaid')
    `).run(invoice_number, order.id, order.patient_id, subtotal, tax, total);

    const invoiceId = result.lastInsertRowid;

    for (const test of tests) {
      db.prepare(`
        INSERT INTO invoice_items (invoice_id, test_id, description, quantity, unit_price, total)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(invoiceId, test.test_id, test.name, test.price, test.price);
    }

    return invoiceId;
  });

  try {
    const invoiceId = generateInvoice();
    res.redirect(`/billing/${invoiceId}`);
  } catch (err) {
    res.redirect(`/orders/${req.params.orderId}?error=${encodeURIComponent(err.message)}`);
  }
});

// View invoice
router.get('/:id', requireAuth, (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, p.first_name, p.last_name, p.patient_id as pid, p.phone, p.email, p.address, p.insurance_provider, p.insurance_number,
      lo.order_number
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    JOIN lab_orders lo ON i.order_id = lo.id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!invoice) return res.status(404).send('Invoice not found');

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);

  res.render('pages/billing/view', { invoice, items });
});

// Mark as paid
router.post('/:id/pay', requireAuth, (req, res) => {
  const { payment_method } = req.body;
  db.prepare("UPDATE invoices SET status = 'paid', payment_method = ?, paid_at = datetime('now') WHERE id = ?").run(payment_method || 'cash', req.params.id);
  res.redirect(`/billing/${req.params.id}`);
});

module.exports = router;
