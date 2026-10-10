const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { calculateMedicineStockMetrics } = require('../services/stockService');

// Public availability check without login
// Returns ONLY categorical status: "Available", "Low Stock", "Out of Stock"
// Never exposes exact quantities, patient data, or confidential lot data
router.get('/availability', (req, res) => {
  const { phc, medicine, search } = req.query;

  if (!phc) {
    return res.status(400).json({ error: 'Please select a Primary Health Centre' });
  }

  const phcRow = db.prepare('SELECT id, name, block, district, phone, address FROM phcs WHERE id = ?').get(phc);
  if (!phcRow) {
    return res.status(404).json({ error: 'Primary Health Centre not found' });
  }

  let medQuery = 'SELECT id, name, generic_name, form, strength, category FROM medicines WHERE 1=1';
  const medParams = [];

  if (medicine) {
    medQuery += ' AND id = ?';
    medParams.push(medicine);
  } else if (search) {
    medQuery += ' AND (LOWER(name) LIKE ? OR LOWER(generic_name) LIKE ?)';
    medParams.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  }

  medQuery += ' ORDER BY name ASC';
  const medicines = db.prepare(medQuery).all(...medParams);

  const results = medicines.map(m => {
    const stockRow = db.prepare('SELECT quantity FROM current_stock WHERE phc_id = ? AND medicine_id = ?').get(phc, m.id);
    const quantity = stockRow ? stockRow.quantity : 0;

    let publicStatus = 'Available';
    let publicStatusTamil = 'இருப்பில் உள்ளது';
    let badgeColor = 'green';

    if (quantity === 0) {
      publicStatus = 'Out of Stock';
      publicStatusTamil = 'தற்போது இருப்பில் இல்லை';
      badgeColor = 'red';
    } else if (quantity < 15) {
      publicStatus = 'Low Stock';
      publicStatusTamil = 'குறைந்த இருப்பு';
      badgeColor = 'amber';
    }

    return {
      medicine_id: m.id,
      medicine_name: m.name,
      generic_name: m.generic_name,
      form: m.form,
      strength: m.strength,
      category: m.category,
      public_status: publicStatus,
      public_status_tamil: publicStatusTamil,
      badge_color: badgeColor
    };
  });

  res.json({
    phc: phcRow,
    total_medicines: results.length,
    results
  });
});

module.exports = router;
