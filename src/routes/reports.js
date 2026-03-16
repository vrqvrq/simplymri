const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// Generate lab report PDF
router.get('/lab-report/:orderId', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT lo.*, p.first_name, p.last_name, p.patient_id as pid, p.date_of_birth, p.gender, p.phone
    FROM lab_orders lo
    JOIN patients p ON lo.patient_id = p.id
    WHERE lo.id = ?
  `).get(req.params.orderId);

  if (!order) return res.status(404).send('Order not found');

  const results = db.prepare(`
    SELECT tr.*, tc.code, tc.name as test_name, tc.category
    FROM test_results tr
    JOIN test_catalog tc ON tr.test_id = tc.id
    WHERE tr.order_id = ?
    ORDER BY tc.category, tc.name
  `).all(order.id);

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=report-${order.order_number}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('SimplyDiagnostic Laboratory', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Clinical Laboratory Report', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Patient info
  doc.fontSize(12).font('Helvetica-Bold').text('Patient Information');
  doc.fontSize(10).font('Helvetica');
  doc.text(`Name: ${order.first_name} ${order.last_name}`);
  doc.text(`Patient ID: ${order.pid}`);
  doc.text(`Date of Birth: ${order.date_of_birth} | Gender: ${order.gender}`);
  doc.text(`Phone: ${order.phone || 'N/A'}`);
  doc.moveDown();
  doc.text(`Order #: ${order.order_number}`);
  doc.text(`Physician: ${order.ordering_physician || 'N/A'}`);
  doc.text(`Date: ${order.created_at}`);
  doc.text(`Priority: ${order.priority}`);
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Results table
  doc.fontSize(12).font('Helvetica-Bold').text('Test Results');
  doc.moveDown(0.5);

  // Table header
  const tableTop = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Test', 50, tableTop, { width: 150 });
  doc.text('Result', 200, tableTop, { width: 80 });
  doc.text('Unit', 280, tableTop, { width: 60 });
  doc.text('Reference', 340, tableTop, { width: 120 });
  doc.text('Flag', 460, tableTop, { width: 60 });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

  // Table rows
  doc.font('Helvetica').fontSize(9);
  let currentCategory = '';
  for (const result of results) {
    if (result.category !== currentCategory) {
      currentCategory = result.category;
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text(currentCategory, 50);
      doc.font('Helvetica');
    }

    const y = doc.y + 2;
    if (y > 700) {
      doc.addPage();
    }

    const rowY = doc.y;
    doc.text(result.test_name, 50, rowY, { width: 150 });
    doc.text(result.result_value || '-', 200, rowY, { width: 80 });
    doc.text(result.unit || '', 280, rowY, { width: 60 });
    doc.text(result.reference_range || '', 340, rowY, { width: 120 });

    if (result.flag && result.flag !== 'NORMAL') {
      doc.font('Helvetica-Bold').fillColor('red');
    }
    doc.text(result.flag || '', 460, rowY, { width: 60 });
    doc.font('Helvetica').fillColor('black');
    doc.moveDown();
  }

  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();
  doc.fontSize(8).text('This report is electronically generated. Results should be interpreted by a qualified physician.', { align: 'center' });
  doc.text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

  doc.end();
});

// Generate invoice PDF
router.get('/invoice/:invoiceId', requireAuth, (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, p.first_name, p.last_name, p.patient_id as pid, p.phone, p.email, p.address,
      p.insurance_provider, p.insurance_number, lo.order_number
    FROM invoices i
    JOIN patients p ON i.patient_id = p.id
    JOIN lab_orders lo ON i.order_id = lo.id
    WHERE i.id = ?
  `).get(req.params.invoiceId);

  if (!invoice) return res.status(404).send('Invoice not found');

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=invoice-${invoice.invoice_number}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('SimplyDiagnostic Laboratory', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('INVOICE', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Invoice details
  doc.fontSize(10);
  doc.text(`Invoice #: ${invoice.invoice_number}`);
  doc.text(`Order #: ${invoice.order_number}`);
  doc.text(`Date: ${invoice.created_at}`);
  doc.text(`Status: ${invoice.status.toUpperCase()}`);
  doc.moveDown();

  // Patient info
  doc.font('Helvetica-Bold').text('Bill To:');
  doc.font('Helvetica');
  doc.text(`${invoice.first_name} ${invoice.last_name} (${invoice.pid})`);
  if (invoice.address) doc.text(invoice.address);
  if (invoice.phone) doc.text(`Phone: ${invoice.phone}`);
  if (invoice.insurance_provider) doc.text(`Insurance: ${invoice.insurance_provider} - ${invoice.insurance_number}`);
  doc.moveDown();

  // Items table
  const tableTop = doc.y;
  doc.font('Helvetica-Bold');
  doc.text('Description', 50, tableTop, { width: 250 });
  doc.text('Qty', 300, tableTop, { width: 50 });
  doc.text('Price', 350, tableTop, { width: 80 });
  doc.text('Total', 450, tableTop, { width: 80 });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.font('Helvetica');

  for (const item of items) {
    const y = doc.y + 2;
    doc.text(item.description, 50, y, { width: 250 });
    doc.text(String(item.quantity), 300, y, { width: 50 });
    doc.text(`$${item.unit_price.toFixed(2)}`, 350, y, { width: 80 });
    doc.text(`$${item.total.toFixed(2)}`, 450, y, { width: 80 });
    doc.moveDown();
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  doc.font('Helvetica-Bold');
  doc.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`, { align: 'right' });
  doc.text(`Tax: $${invoice.tax.toFixed(2)}`, { align: 'right' });
  doc.text(`Discount: -$${invoice.discount.toFixed(2)}`, { align: 'right' });
  doc.fontSize(14).text(`Total: $${invoice.total.toFixed(2)}`, { align: 'right' });

  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica').text('Thank you for choosing SimplyDiagnostic Laboratory.', { align: 'center' });

  doc.end();
});

module.exports = router;
