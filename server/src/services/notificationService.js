const { db } = require('../db/database');

/**
 * Pluggable notification service for SMS and WhatsApp
 * In development / local environment, records to SQLite notification_dispatches table
 * and prints styled terminal receipt.
 */
function sendNotification({ recipientPhone, channel = 'sms', alertId = null, message }) {
  const id = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  try {
    const stmt = db.prepare(`
      INSERT INTO notification_dispatches (id, recipient_phone, channel, alert_id, message, dispatched_at, status)
      VALUES (?, ?, ?, ?, ?, datetime('now'), 'sent')
    `);
    stmt.run(id, recipientPhone, channel, alertId, message);

    console.log(`\n📨 [DISPATCHED ${channel.toUpperCase()}]`);
    console.log(`📱 To: ${recipientPhone}`);
    console.log(`💬 Message: ${message}`);
    console.log(`----------------------------------------\n`);

    return {
      success: true,
      dispatchId: id,
      channel,
      status: 'delivered_mock',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('Error dispatching notification:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

function getRecentNotifications(limit = 20) {
  return db.prepare(`
    SELECT n.*, a.severity, a.alert_type
    FROM notification_dispatches n
    LEFT JOIN alerts a ON n.alert_id = a.id
    ORDER BY n.dispatched_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  sendNotification,
  getRecentNotifications
};
