const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Default system logistics settings
const defaultSettings = {
  donor_safety_reserve_days: '14',
  fefo_window_days: '90',
  critical_shortage_threshold_days: '3',
  warning_threshold_days: '8',
  stale_data_threshold_hours: '24'
};

/**
 * GET /api/settings
 * Fetch configured thresholds
 */
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM application_settings').all();
    const settings = { ...defaultSettings };
    rows.forEach(r => {
      settings[r.key] = r.value;
    });

    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', details: err.message });
  }
});

/**
 * PATCH /api/settings
 * Update configured thresholds
 */
router.patch('/', (req, res) => {
  const updates = req.body;
  try {
    const stmt = db.prepare(`
      INSERT INTO application_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `);

    Object.entries(updates).forEach(([k, v]) => {
      stmt.run(k, String(v));
    });

    res.json({ message: 'Logistics settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings', details: err.message });
  }
});

module.exports = router;
