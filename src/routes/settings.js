const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Settings page
router.get('/', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, email, active, created_at FROM users ORDER BY created_at').all();
  const tests = db.prepare('SELECT * FROM test_catalog ORDER BY category, name').all();
  res.render('pages/settings/index', { users, tests, error: null, success: null });
});

// Add user
router.post('/users', requireRole('admin'), (req, res) => {
  const { username, password, full_name, role, email } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password, full_name, role, email) VALUES (?, ?, ?, ?, ?)').run(username, hashedPassword, full_name, role || 'technician', email);
    res.redirect('/settings');
  } catch (err) {
    res.redirect(`/settings?error=${encodeURIComponent(err.message)}`);
  }
});

// Toggle user active
router.post('/users/:id/toggle', requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT active FROM users WHERE id = ?').get(req.params.id);
  if (user) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, req.params.id);
  }
  res.redirect('/settings');
});

// Change password
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.redirect('/settings?error=Current password is incorrect');
  }

  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
  res.redirect('/settings?success=Password changed successfully');
});

module.exports = router;
