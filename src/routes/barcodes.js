const express = require('express');
const router = express.Router();
const bwipjs = require('bwip-js');
const { requireAuth } = require('../middleware/auth');

// Generate barcode image for a sample
router.get('/barcode/:sampleId', requireAuth, (req, res) => {
  bwipjs.toBuffer({
    bcid: 'code128',
    text: req.params.sampleId,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: 'center',
    textsize: 10
  }, (err, png) => {
    if (err) return res.status(500).send('Barcode generation failed');
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  });
});

// Generate QR code for a sample
router.get('/qr/:sampleId', requireAuth, (req, res) => {
  bwipjs.toBuffer({
    bcid: 'qrcode',
    text: req.params.sampleId,
    scale: 4,
    height: 20,
    width: 20
  }, (err, png) => {
    if (err) return res.status(500).send('QR generation failed');
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  });
});

// Print label page for a sample
router.get('/label/:sampleId', requireAuth, (req, res) => {
  const db = require('../models/db');
  const sample = db.prepare(`
    SELECT s.*, lo.order_number, p.first_name, p.last_name, p.patient_id as pid, p.date_of_birth
    FROM samples s
    JOIN lab_orders lo ON s.order_id = lo.id
    JOIN patients p ON lo.patient_id = p.id
    WHERE s.sample_id = ?
  `).get(req.params.sampleId);

  if (!sample) return res.status(404).send('Sample not found');
  res.render('pages/samples/label', { sample });
});

module.exports = router;
