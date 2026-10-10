const express = require('express');
const router = express.Router();
const {
  calculateFefoAllocations,
  createDraftBill,
  confirmBillDispense,
  cancelBill,
  reverseBill,
  getBillById,
  listBills
} = require('../services/billingService');

/**
 * GET /api/billing
 * List billing / dispensing records
 */
router.get('/', (req, res) => {
  try {
    const { phc_id, status, search, limit } = req.query;
    const bills = listBills({ phc_id, status, search, limit });
    res.json(bills);
  } catch (err) {
    console.error('Error fetching billing records:', err);
    res.status(500).json({ error: 'Failed to fetch billing records', details: err.message });
  }
});

/**
 * GET /api/billing/:id
 * Single bill details with full batch allocation breakdown
 */
router.get('/:id', (req, res) => {
  try {
    const bill = getBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Billing record not found' });
    }
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bill', details: err.message });
  }
});

/**
 * POST /api/billing/preview
 * Preview FEFO batch allocation without mutating database
 */
router.post('/preview', (req, res) => {
  const { phc_id, medicine_id, requested_quantity } = req.body;
  if (!phc_id || !medicine_id || !requested_quantity) {
    return res.status(400).json({ error: 'Centre ID, medicine ID, and requested quantity are required' });
  }

  try {
    const preview = calculateFefoAllocations(phc_id, medicine_id, requested_quantity);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/billing/draft
 * Create a new Draft Bill / Dispensing Record (DOES NOT DEDUCT STOCK)
 */
router.post('/draft', (req, res) => {
  try {
    const draft = createDraftBill(req.body);
    res.status(201).json({
      message: 'Draft bill generated successfully. Stock has not been deducted.',
      bill: draft
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/billing/:id/confirm
 * Confirm dispensing: Atomically deducts inventory using FEFO with idempotency protection
 */
router.post('/:id/confirm', (req, res) => {
  const { confirmed_by, idempotency_key } = req.body;
  try {
    const confirmedBill = confirmBillDispense(req.params.id, { confirmed_by, idempotency_key });
    res.json({
      message: 'Medicine dispensing confirmed. Batch inventory and stock ledger updated.',
      bill: confirmedBill
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/billing/:id/cancel
 * Cancel an unconfirmed draft bill (DOES NOT DEDUCT STOCK)
 */
router.post('/:id/cancel', (req, res) => {
  const { reason, cancelled_by } = req.body;
  try {
    const cancelledBill = cancelBill(req.params.id, { reason, cancelled_by });
    res.json({
      message: 'Draft bill cancelled. Inventory remains unchanged.',
      bill: cancelledBill
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/billing/:id/reverse
 * Auditable return / reversal of a confirmed bill (restores stock atomically)
 */
router.post('/:id/reverse', (req, res) => {
  const { reason, recorded_by } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'Reversal reason is mandatory for audit logging' });
  }

  try {
    const reversedBill = reverseBill(req.params.id, { reason, recorded_by });
    res.json({
      message: 'Bill reversed successfully. Stock restored to inventory and audit movement recorded.',
      bill: reversedBill
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
