const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth } = require('../middleware/auth');

// API: Get all panels with their tests
router.get('/api/list', requireAuth, (req, res) => {
  const panels = db.prepare('SELECT * FROM test_panels WHERE active = 1 ORDER BY name').all();
  for (const panel of panels) {
    panel.tests = db.prepare(`
      SELECT tc.* FROM panel_tests pt
      JOIN test_catalog tc ON pt.test_id = tc.id
      WHERE pt.panel_id = ?
    `).all(panel.id);
  }
  res.json(panels);
});

module.exports = router;
