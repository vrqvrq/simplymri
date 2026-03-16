const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// List all tests
router.get('/', requireAuth, (req, res) => {
  const category = req.query.category || '';
  let tests;
  if (category) {
    tests = db.prepare('SELECT * FROM test_catalog WHERE category = ? ORDER BY name').all(category);
  } else {
    tests = db.prepare('SELECT * FROM test_catalog ORDER BY category, name').all();
  }
  const categories = db.prepare('SELECT DISTINCT category FROM test_catalog ORDER BY category').all().map(r => r.category);
  res.render('pages/tests/list', { tests, categories, category });
});

// New test form
router.get('/new', requireAuth, (req, res) => {
  const categories = db.prepare('SELECT DISTINCT category FROM test_catalog ORDER BY category').all().map(r => r.category);
  res.render('pages/tests/form', { test: null, categories, error: null });
});

// Create test
router.post('/', requireAuth, (req, res) => {
  const { code, name, category, new_category, description, sample_type, unit, reference_range_min, reference_range_max, reference_range_text, price, turnaround_hours } = req.body;
  const cat = new_category && new_category.trim() ? new_category.trim() : category;

  try {
    db.prepare(`
      INSERT INTO test_catalog (code, name, category, description, sample_type, unit, reference_range_min, reference_range_max, reference_range_text, price, turnaround_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code.toUpperCase().trim(),
      name.trim(),
      cat,
      description || null,
      sample_type,
      unit || null,
      reference_range_min ? parseFloat(reference_range_min) : null,
      reference_range_max ? parseFloat(reference_range_max) : null,
      reference_range_text || null,
      parseFloat(price) || 0,
      parseInt(turnaround_hours) || 24
    );
    res.locals.audit('Added test', 'test_catalog', code, name);
    res.redirect('/tests?success=Test added successfully');
  } catch (err) {
    const categories = db.prepare('SELECT DISTINCT category FROM test_catalog ORDER BY category').all().map(r => r.category);
    res.render('pages/tests/form', { test: req.body, categories, error: err.message });
  }
});

// Edit test form
router.get('/:id/edit', requireAuth, (req, res) => {
  const test = db.prepare('SELECT * FROM test_catalog WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).send('Test not found');
  const categories = db.prepare('SELECT DISTINCT category FROM test_catalog ORDER BY category').all().map(r => r.category);
  res.render('pages/tests/form', { test, categories, error: null });
});

// Update test
router.post('/:id', requireAuth, (req, res) => {
  const { code, name, category, new_category, description, sample_type, unit, reference_range_min, reference_range_max, reference_range_text, price, turnaround_hours } = req.body;
  const cat = new_category && new_category.trim() ? new_category.trim() : category;

  try {
    db.prepare(`
      UPDATE test_catalog SET code=?, name=?, category=?, description=?, sample_type=?, unit=?,
        reference_range_min=?, reference_range_max=?, reference_range_text=?, price=?, turnaround_hours=?
      WHERE id=?
    `).run(
      code.toUpperCase().trim(),
      name.trim(),
      cat,
      description || null,
      sample_type,
      unit || null,
      reference_range_min ? parseFloat(reference_range_min) : null,
      reference_range_max ? parseFloat(reference_range_max) : null,
      reference_range_text || null,
      parseFloat(price) || 0,
      parseInt(turnaround_hours) || 24,
      req.params.id
    );
    res.locals.audit('Updated test', 'test_catalog', code, name);
    res.redirect('/tests?success=Test updated successfully');
  } catch (err) {
    const categories = db.prepare('SELECT DISTINCT category FROM test_catalog ORDER BY category').all().map(r => r.category);
    res.render('pages/tests/form', { test: { id: req.params.id, ...req.body }, categories, error: err.message });
  }
});

// Toggle active
router.post('/:id/toggle', requireAuth, (req, res) => {
  const test = db.prepare('SELECT active, code, name FROM test_catalog WHERE id = ?').get(req.params.id);
  if (test) {
    db.prepare('UPDATE test_catalog SET active = ? WHERE id = ?').run(test.active ? 0 : 1, req.params.id);
    res.locals.audit(test.active ? 'Deactivated test' : 'Activated test', 'test_catalog', test.code, test.name);
  }
  res.redirect('/tests');
});

module.exports = router;
