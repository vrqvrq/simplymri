const db = require('../models/db');

function logAction(userId, userName, action, entityType, entityId, details, ip) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userName, action, entityType, entityId || null, details || null, ip || null);
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

function auditMiddleware(req, res, next) {
  res.locals.audit = function(action, entityType, entityId, details) {
    const user = req.session && req.session.user;
    logAction(
      user ? user.id : null,
      user ? user.full_name : 'System',
      action,
      entityType,
      entityId,
      details,
      req.ip
    );
  };
  next();
}

module.exports = { logAction, auditMiddleware };
