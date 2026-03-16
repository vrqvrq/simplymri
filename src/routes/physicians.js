const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List physicians
router.get('/', requireAuth, (req, res) => {
  const physicians = db.prepare('SELECT * FROM physicians ORDER BY name').all();
  res.render('pages/physicians/list', { physicians });
});

// New physician form
router.get('/new', requireAuth, (req, res) => {
  res.render('pages/physicians/form', { physician: null, error: null });
});

// Create physician
router.post('/', requireAuth, (req, res) => {
  const { name, specialty, clinic, phone, email, license_number, notes } = req.body;
  try {
    db.prepare('INSERT INTO physicians (name, specialty, clinic, phone, email, license_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, specialty, clinic, phone, email, license_number, notes);
    res.locals.audit('Added physician', 'physician', null, name);
    res.redirect('/physicians');
  } catch (err) {
    res.render('pages/physicians/form', { physician: req.body, error: err.message });
  }
});

// Edit form
router.get('/:id/edit', requireAuth, (req, res) => {
  const physician = db.prepare('SELECT * FROM physicians WHERE id = ?').get(req.params.id);
  if (!physician) return res.status(404).send('Physician not found');
  res.render('pages/physicians/form', { physician, error: null });
});

// Update
router.post('/:id', requireAuth, (req, res) => {
  const { name, specialty, clinic, phone, email, license_number, notes } = req.body;
  db.prepare('UPDATE physicians SET name=?, specialty=?, clinic=?, phone=?, email=?, license_number=?, notes=? WHERE id=?')
    .run(name, specialty, clinic, phone, email, license_number, notes, req.params.id);
  res.locals.audit('Updated physician', 'physician', req.params.id, name);
  res.redirect('/physicians');
});

// Toggle active
router.post('/:id/toggle', requireAuth, (req, res) => {
  const p = db.prepare('SELECT active FROM physicians WHERE id = ?').get(req.params.id);
  if (p) db.prepare('UPDATE physicians SET active = ? WHERE id = ?').run(p.active ? 0 : 1, req.params.id);
  res.redirect('/physicians');
});

// API: search physicians for autocomplete
router.get('/api/search', requireAuth, (req, res) => {
  const q = req.query.q || '';
  if (q.length < 1) return res.json([]);
  const results = db.prepare('SELECT id, name, specialty, clinic FROM physicians WHERE active = 1 AND (name LIKE ? OR clinic LIKE ?) LIMIT 10')
    .all(`%${q}%`, `%${q}%`);
  res.json(results);
});

module.exports = router;
