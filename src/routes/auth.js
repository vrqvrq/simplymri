const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/db');

router.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

router.get('/login', (req, res) => {
  res.render('pages/login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('pages/login', { error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('pages/login', { error: 'Invalid username or password' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role
  };

  res.locals.audit('Login', 'user', user.username, `${user.full_name} logged in`);

  // Force password change for default/flagged accounts
  if (user.force_password_change) {
    return res.redirect('/force-password-change');
  }

  res.redirect('/dashboard');
});

// Force password change page
router.get('/force-password-change', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/login');
  res.render('pages/force-password-change', { error: null });
});

router.post('/force-password-change', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/login');

  const { new_password, confirm_password } = req.body;

  if (!new_password || new_password.length < 8) {
    return res.render('pages/force-password-change', { error: 'Password must be at least 8 characters long' });
  }
  if (!/[A-Z]/.test(new_password)) {
    return res.render('pages/force-password-change', { error: 'Password must contain at least one uppercase letter' });
  }
  if (!/[a-z]/.test(new_password)) {
    return res.render('pages/force-password-change', { error: 'Password must contain at least one lowercase letter' });
  }
  if (!/[0-9]/.test(new_password)) {
    return res.render('pages/force-password-change', { error: 'Password must contain at least one number' });
  }
  if (new_password !== confirm_password) {
    return res.render('pages/force-password-change', { error: 'Passwords do not match' });
  }

  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ?, force_password_change = 0 WHERE id = ?').run(hashed, req.session.user.id);

  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
