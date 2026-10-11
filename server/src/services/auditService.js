const { db } = require('../db/database');

function logAudit({ userId, action, entityType, entityId, details, ipAddress = '127.0.0.1' }) {
  const id = `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const detailsStr = typeof details === 'object' && details !== null ? JSON.stringify(details) : (details !== undefined ? String(details) : null);
    stmt.run(id, userId, action, entityType, entityId, detailsStr, ipAddress);
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

function getAuditLogs(limit = 50) {
  return db.prepare(`
    SELECT a.*, u.name as user_name, u.role as user_role
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  logAudit,
  getAuditLogs
};
