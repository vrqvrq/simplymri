const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { requireAuth, requireRole } = require('../middleware/auth');

function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
}

// Settings page
router.get('/', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, email, active, created_at FROM users ORDER BY created_at').all();
  const tests = db.prepare('SELECT * FROM test_catalog ORDER BY category, name').all();
  const emailSettings = db.prepare('SELECT * FROM notification_settings LIMIT 1').get() || null;
  res.render('pages/settings/index', { users, tests, emailSettings, error: null, success: null });
});

// Add user
router.post('/users', requireRole('admin'), (req, res) => {
  const { username, password, full_name, role, email } = req.body;

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.redirect(`/settings?error=${encodeURIComponent(passwordError)}`);
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password, full_name, role, email) VALUES (?, ?, ?, ?, ?)').run(username, hashedPassword, full_name, role || 'technician', email);
    res.redirect('/settings');
  } catch (err) {
    console.error('Error creating user:', err.message);
    res.redirect('/settings?error=Failed+to+create+user');
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
    return res.redirect('/settings?error=Current+password+is+incorrect');
  }

  const passwordError = validatePassword(new_password);
  if (passwordError) {
    return res.redirect(`/settings?error=${encodeURIComponent(passwordError)}`);
  }

  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
  res.redirect('/settings?success=Password+changed+successfully');
});

// Save email settings
router.post('/email', requireRole('admin'), (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from } = req.body;

  const existing = db.prepare('SELECT id FROM notification_settings LIMIT 1').get();
  if (existing) {
    if (smtp_pass && smtp_pass !== '********') {
      db.prepare('UPDATE notification_settings SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_pass=?, smtp_from=?, enabled=1 WHERE id=?')
        .run(smtp_host, smtp_port || 587, smtp_user, smtp_pass, smtp_from, existing.id);
    } else {
      db.prepare('UPDATE notification_settings SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_from=?, enabled=1 WHERE id=?')
        .run(smtp_host, smtp_port || 587, smtp_user, smtp_from, existing.id);
    }
  } else {
    db.prepare('INSERT INTO notification_settings (smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, enabled) VALUES (?, ?, ?, ?, ?, 1)')
      .run(smtp_host, smtp_port || 587, smtp_user, smtp_pass || '', smtp_from);
  }

  res.locals.audit('Updated email settings', 'settings', null, 'SMTP configuration changed');
  res.redirect('/settings?success=Email+settings+saved');
});

module.exports = router;
