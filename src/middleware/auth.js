function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
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
