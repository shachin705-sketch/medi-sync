const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const {
  runFullAutomationCycle,
  getSetting,
  setSetting,
  transitionTransferLifecycle,
  evaluateStockHealth,
  discoverSafeDonors
} = require('../services/automationEngine');

/**
 * POST /api/automation/run
 * Manually triggers the full automation cycle immediately.
 */
router.post('/run', (req, res) => {
  try {
    const result = runFullAutomationCycle();
    res.json({
      success: true,
      data: result,
      message: 'Automated stock evaluation, requisition discovery and escalation cycle executed successfully.'
    });
  } catch (err) {
    console.error('Error executing automation run:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/automation/status
 * Returns current automation state, policy, active reservations, and recent job logs.
 */
router.get('/status', (req, res) => {
  try {
    const policy = getSetting('approval_policy', 'AUTO');
    const intervalSec = getSetting('automation_interval_seconds', '30');

    const lastJob = db.prepare(`
      SELECT * FROM background_jobs 
      WHERE job_name = 'AUTOMATION_CYCLE' 
      ORDER BY created_at DESC LIMIT 1
    `).get() || null;

    const recentJobs = db.prepare(`
      SELECT * FROM background_jobs 
      ORDER BY created_at DESC LIMIT 10
    `).all();

    const activeReservationsCount = db.prepare(`
      SELECT COUNT(*) as count FROM stock_reservations WHERE status = 'RESERVED'
    `).get().count;

    const totalAutoRequisitions = db.prepare(`
      SELECT COUNT(*) as count FROM transfer_requests WHERE auto_generated = 1
    `).get().count;

    const autoApprovedCount = db.prepare(`
      SELECT COUNT(*) as count FROM transfer_requests WHERE is_auto_approved = 1
    `).get().count;

    const awaitingApprovalCount = db.prepare(`
      SELECT COUNT(*) as count FROM transfer_requests WHERE status = 'requested'
    `).get().count;

    const warehouseEscalatedCount = db.prepare(`
      SELECT COUNT(*) as count FROM transfer_requests WHERE warehouse_escalated = 1
    `).get().count;

    const unreadNotificationsCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications WHERE read_status = 0
    `).get().count;

    res.json({
      success: true,
      data: {
        engine_status: 'ACTIVE',
        approval_policy: policy,
        interval_seconds: Number(intervalSec),
        last_run: lastJob ? lastJob.created_at : 'Just now',
        last_job: lastJob,
        recent_jobs: recentJobs,
        metrics: {
          active_reservations: activeReservationsCount,
          total_auto_requisitions: totalAutoRequisitions,
          auto_approved_count: autoApprovedCount,
          awaiting_approval_count: awaitingApprovalCount,
          warehouse_escalated_count: warehouseEscalatedCount,
          unread_notifications_count: unreadNotificationsCount
        }
      }
    });
  } catch (err) {
    console.error('Error fetching automation status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/automation/policy
 * Updates the approval policy (Policy A = AUTO, Policy B = MANUAL).
 */
router.post('/policy', (req, res) => {
  try {
    const { policy } = req.body;
    if (!['AUTO', 'MANUAL'].includes(policy)) {
      return res.status(400).json({ success: false, error: "Policy must be either 'AUTO' or 'MANUAL'" });
    }

    setSetting('approval_policy', policy);
    res.json({
      success: true,
      message: `Approval policy successfully updated to ${policy === 'AUTO' ? 'Policy A (Automatic Approval)' : 'Policy B (Human Approval)'}.`,
      current_policy: policy
    });
  } catch (err) {
    console.error('Error updating approval policy:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/automation/notifications
 * Returns persistent in-app notifications with plain language explanations.
 */
router.get('/notifications', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const notifications = db.prepare(`
      SELECT n.*, p.name as phc_name, p.district as phc_district
      FROM notifications n
      LEFT JOIN phcs p ON n.phc_id = p.id
      ORDER BY n.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      data: notifications
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/automation/notifications/:id/read
 * Marks a notification as read.
 */
router.patch('/notifications/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE notifications SET read_status = 1 WHERE id = ?').run(id);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/automation/notifications/mark-all-read
 * Marks all notifications as read.
 */
router.post('/notifications/mark-all-read', (req, res) => {
  try {
    db.prepare('UPDATE notifications SET read_status = 1 WHERE read_status = 0').run();
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/automation/reservations
 * Returns active stock reservations.
 */
router.get('/reservations', (req, res) => {
  try {
    const reservations = db.prepare(`
      SELECT sr.*, p.name as phc_name, m.name as medicine_name, m.unit
      FROM stock_reservations sr
      JOIN phcs p ON sr.phc_id = p.id
      JOIN medicines m ON sr.medicine_id = m.id
      WHERE sr.status = 'RESERVED'
      ORDER BY sr.created_at DESC
    `).all();

    res.json({
      success: true,
      data: reservations
    });
  } catch (err) {
    console.error('Error fetching reservations:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/automation/transfer-action
 * Executes an auditable transfer lifecycle state transition:
 * APPROVE | DISPATCH | RECEIVE | REJECT | CANCEL
 */
router.post('/transfer-action', (req, res) => {
  try {
    const {
      requisitionId,
      action,
      quantity,
      receivedQuantity,
      discrepancyReason,
      rejectionReason,
      actorName = 'Staff Member'
    } = req.body;

    if (!requisitionId || !action) {
      return res.status(400).json({ success: false, error: 'requisitionId and action are required.' });
    }

    const result = transitionTransferLifecycle({
      requisitionId,
      action,
      actorName,
      quantity,
      receivedQuantity,
      discrepancyReason,
      rejectionReason
    });

    res.json({
      success: true,
      data: result,
      message: `Transfer lifecycle successfully transitioned via action ${action}.`
    });
  } catch (err) {
    console.error('Error in transfer lifecycle transition:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/automation/donor-discovery
 * Runs donor discovery for a specific centre and medicine.
 */
router.get('/donor-discovery', (req, res) => {
  try {
    const { destPhcId, medicineId, quantity } = req.query;
    if (!destPhcId || !medicineId) {
      return res.status(400).json({ success: false, error: 'destPhcId and medicineId are required' });
    }

    const discovery = discoverSafeDonors({
      destPhcId,
      medicineId,
      neededQuantity: Number(quantity) || 40
    });

    res.json({
      success: true,
      data: discovery
    });
  } catch (err) {
    console.error('Error in donor discovery:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
