const db = require('../models/db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  // Check if user needs to change password (skip for the force-change route itself)
  if (req.originalUrl !== '/force-password-change') {
    const user = db.prepare('SELECT force_password_change FROM users WHERE id = ?').get(req.session.user.id);
    if (user && user.force_password_change) {
      return res.redirect('/force-password-change');
    }
  }

  res.locals.user = req.session.user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).send('Access denied');
    }
    res.locals.user = req.session.user;
    next();
  };
}

module.exports = { requireAuth, requireRole };
