const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

/**
 * GET /api/analytics/stock-trends
 * Multi-day stock and consumption trends across essential medicines
 */
router.get('/stock-trends', (req, res) => {
  try {
    const trends = db.prepare(`
      SELECT entry_date, 
             SUM(opening_stock) as total_opening, 
             SUM(received_quantity) as total_received, 
             SUM(dispensed_quantity) as total_dispensed, 
             SUM(closing_stock) as total_closing
      FROM stock_entries
      GROUP BY entry_date
      ORDER BY entry_date DESC
      LIMIT 14
    `).all();

    res.json(trends.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock trends', details: err.message });
  }
});

/**
 * GET /api/analytics/expiry
 * Expiry distribution buckets (<30d, 31-90d, 91-180d, >180d)
 */
router.get('/expiry', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        CASE 
          WHEN julianday(expiry_date) - julianday('now') <= 30 THEN '< 30 days (Urgent FEFO)'
          WHEN julianday(expiry_date) - julianday('now') <= 90 THEN '31 - 90 days (Watchlist)'
          WHEN julianday(expiry_date) - julianday('now') <= 180 THEN '91 - 180 days (Normal)'
          ELSE '> 180 days (Stable Buffer)'
        END as expiry_bucket,
        COUNT(*) as batches_count,
        SUM(quantity) as total_units
      FROM current_stock
      WHERE expiry_date IS NOT NULL AND quantity > 0
      GROUP BY expiry_bucket
    `).all();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expiry distribution', details: err.message });
  }
});

/**
 * GET /api/analytics/transfers
 * Transfer volumes, fulfillment rates, and route metrics
 */
router.get('/transfers', (req, res) => {
  try {
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count, SUM(quantity) as total_units
      FROM transfer_requests
      GROUP BY status
    `).all();

    const topRoutes = db.prepare(`
      SELECT sp.name as source_phc, dp.name as dest_phc, COUNT(*) as transfers_count, SUM(t.quantity) as units_transferred
      FROM transfer_requests t
      JOIN phcs sp ON t.source_phc_id = sp.id
      JOIN phcs dp ON t.dest_phc_id = dp.id
      GROUP BY t.source_phc_id, t.dest_phc_id
      ORDER BY transfers_count DESC
      LIMIT 5
    `).all();

    res.json({
      status_distribution: statusCounts,
      top_routes: topRoutes,
      total_transfers: statusCounts.reduce((sum, r) => sum + r.count, 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transfer analytics', details: err.message });
  }
});

/**
 * GET /api/analytics/shortages
 * Historical shortages and resolutions
 */
router.get('/shortages', (req, res) => {
  try {
    const resolvedShortages = db.prepare(`
      SELECT a.*, p.name as phc_name, m.name as medicine_name
      FROM alerts a
      JOIN phcs p ON a.phc_id = p.id
      JOIN medicines m ON a.medicine_id = m.id
      WHERE a.severity = 'critical'
      ORDER BY a.created_at DESC
      LIMIT 15
    `).all();

    res.json(resolvedShortages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shortage analytics', details: err.message });
  }
});

module.exports = router;
