const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'medsync.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for better concurrency and foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// Initialize schema
function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  // Safe additive migrations for transfer workflows
  const additiveCols = [
    'ALTER TABLE transfer_requests ADD COLUMN approved_quantity INTEGER;',
    'ALTER TABLE transfer_requests ADD COLUMN fefo_batch_number TEXT;',
    'ALTER TABLE transfer_requests ADD COLUMN fefo_expiry_date DATE;',
    'ALTER TABLE transfer_requests ADD COLUMN collection_details TEXT;',
    'ALTER TABLE transfer_requests ADD COLUMN handover_by TEXT;',
    'ALTER TABLE transfer_requests ADD COLUMN receipt_confirmed_by TEXT;',
    'ALTER TABLE transfer_requests ADD COLUMN received_quantity INTEGER;',
    'ALTER TABLE transfer_requests ADD COLUMN discrepancy_reason TEXT;',
    'ALTER TABLE transfer_requests ADD COLUMN escalation_notes TEXT;',
    'ALTER TABLE transfer_requests ADD COLUMN before_donor_stock INTEGER;',
    'ALTER TABLE transfer_requests ADD COLUMN after_donor_stock INTEGER;',
    'ALTER TABLE transfer_requests ADD COLUMN before_dest_stock INTEGER;',
    'ALTER TABLE transfer_requests ADD COLUMN after_dest_stock INTEGER;',
    'ALTER TABLE current_stock ADD COLUMN min_safety_stock INTEGER DEFAULT 14;',
    'ALTER TABLE current_stock ADD COLUMN avg_daily_usage REAL DEFAULT 5;',
    'ALTER TABLE phcs ADD COLUMN facility_type TEXT DEFAULT "PHC";',
    'ALTER TABLE phcs ADD COLUMN is_warehouse INTEGER DEFAULT 0;',
    'ALTER TABLE transfer_requests ADD COLUMN lifecycle_stage TEXT DEFAULT "REQUESTED";',
    'ALTER TABLE transfer_requests ADD COLUMN policy_applied TEXT DEFAULT "MANUAL";',
    'ALTER TABLE transfer_requests ADD COLUMN is_auto_approved INTEGER DEFAULT 0;',
    'ALTER TABLE transfer_requests ADD COLUMN warehouse_escalated INTEGER DEFAULT 0;',
    'ALTER TABLE transfer_requests ADD COLUMN discrepancy_quantity INTEGER DEFAULT 0;',
    'ALTER TABLE transfer_requests ADD COLUMN is_overdue_approval INTEGER DEFAULT 0;',
    'ALTER TABLE transfer_requests ADD COLUMN is_overdue_transit INTEGER DEFAULT 0;',
    'ALTER TABLE transfer_requests ADD COLUMN auto_generated INTEGER DEFAULT 0;'
  ];
  additiveCols.forEach(cmd => {
    try { db.exec(cmd); } catch (e) {}
  });

  // Additional support tables
  try {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES ('usr-system-automation', 'MediAlert AI Automation Engine', 'automation@medsync.gov.in', 'sys_hash', 'district_admin')
    `).run();

    db.exec(`
      CREATE TABLE IF NOT EXISTS application_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default automation settings if not present
    const defaultSettings = [
      ['approval_policy', 'AUTO'],
      ['automation_interval_seconds', '30'],
      ['safety_reserve_days', '14'],
      ['target_buffer_days', '30'],
      ['max_auto_approve_qty', '200'],
      ['overdue_approval_hours', '24'],
      ['overdue_transit_hours', '48']
    ];
    const insertSetting = db.prepare('INSERT OR IGNORE INTO application_settings (key, value) VALUES (?, ?)');
    defaultSettings.forEach(([k, v]) => insertSetting.run(k, v));

    // Stock reservations table for locking donor surplus
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id TEXT PRIMARY KEY,
        requisition_id TEXT NOT NULL,
        phc_id TEXT NOT NULL,
        medicine_id TEXT NOT NULL,
        batch_number TEXT NOT NULL,
        reserved_quantity INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(phc_id) REFERENCES phcs(id),
        FOREIGN KEY(medicine_id) REFERENCES medicines(id)
      );
    `);

    // Background jobs execution logging
    db.exec(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY,
        job_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILED', 'RUNNING')),
        items_processed INTEGER DEFAULT 0,
        message TEXT,
        duration_ms INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Persistent in-app notifications table
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        phc_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('critical', 'warning', 'info', 'success')),
        category TEXT NOT NULL CHECK(category IN ('shortage', 'low_stock', 'requisition', 'approval', 'reservation', 'dispatch', 'receipt', 'escalation', 'near_expiry', 'offline_sync', 'system')),
        link TEXT,
        read_status INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_recommendations (
        id TEXT PRIMARY KEY,
        destination_phc_id TEXT NOT NULL,
        source_phc_id TEXT,
        medicine_id TEXT NOT NULL,
        proposed_quantity INTEGER NOT NULL,
        reason TEXT NOT NULL,
        urgency TEXT DEFAULT 'HIGH',
        donor_safety_passed INTEGER DEFAULT 1,
        donor_before_stock INTEGER,
        donor_after_stock INTEGER,
        donor_before_days REAL,
        donor_after_days REAL,
        dest_before_stock INTEGER,
        dest_after_stock INTEGER,
        dest_before_days REAL,
        dest_after_days REAL,
        fefo_batch TEXT,
        fefo_expiry DATE,
        distance_km REAL,
        travel_time_mins REAL,
        status TEXT DEFAULT 'recommended',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 1. Batch-level Inventory Table for every centre, medicine, and batch
    db.exec(`
      CREATE TABLE IF NOT EXISTS centre_batch_stock (
        id TEXT PRIMARY KEY,
        phc_id TEXT NOT NULL,
        medicine_id TEXT NOT NULL,
        batch_number TEXT NOT NULL,
        expiry_date DATE NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        mfg_date DATE,
        received_date DATE,
        supplier TEXT,
        unit TEXT DEFAULT 'units',
        min_safety_stock INTEGER DEFAULT 14,
        avg_daily_usage REAL DEFAULT 5,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'recalled', 'quarantined')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(phc_id, medicine_id, batch_number),
        FOREIGN KEY(phc_id) REFERENCES phcs(id),
        FOREIGN KEY(medicine_id) REFERENCES medicines(id)
      );
    `);

    // 2. Comprehensive Stock Movement Ledger
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        phc_id TEXT NOT NULL,
        medicine_id TEXT NOT NULL,
        batch_number TEXT NOT NULL,
        movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING_STOCK', 'SUPPLIER_RECEIPT', 'DISPENSED', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIPT', 'ADJUSTMENT', 'REVERSAL', 'WRITE_OFF')),
        quantity INTEGER NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        batch_balance_before INTEGER,
        batch_balance_after INTEGER,
        reference_id TEXT,
        recorded_by TEXT NOT NULL,
        reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(phc_id) REFERENCES phcs(id),
        FOREIGN KEY(medicine_id) REFERENCES medicines(id)
      );
    `);

    // 3. Billing & Dispensing Records
    db.exec(`
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        bill_number TEXT UNIQUE NOT NULL,
        phc_id TEXT NOT NULL,
        patient_demo_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Partially Dispensed', 'Dispensed', 'Cancelled', 'Reversed')),
        prescribed_by TEXT,
        recorded_by TEXT NOT NULL,
        confirmed_by TEXT,
        total_prescribed INTEGER DEFAULT 0,
        total_dispensed INTEGER DEFAULT 0,
        idempotency_key TEXT UNIQUE,
        cancellation_reason TEXT,
        reversal_reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        confirmed_at DATETIME,
        reversed_at DATETIME,
        FOREIGN KEY(phc_id) REFERENCES phcs(id)
      );
    `);

    // 4. Bill Line Items & Batch Allocation Breakdown
    db.exec(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id TEXT PRIMARY KEY,
        bill_id TEXT NOT NULL,
        medicine_id TEXT NOT NULL,
        prescribed_quantity INTEGER NOT NULL,
        dispensed_quantity INTEGER DEFAULT 0,
        remaining_quantity INTEGER DEFAULT 0,
        unit TEXT NOT NULL,
        batch_allocations TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'dispensed', 'partially_dispensed', 'cancelled', 'reversed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bill_id) REFERENCES bills(id),
        FOREIGN KEY(medicine_id) REFERENCES medicines(id)
      );
    `);

    // Auto-populate centre_batch_stock from current_stock if centre_batch_stock is empty
    const batchStockCount = db.prepare('SELECT COUNT(*) as count FROM centre_batch_stock').get().count;
    if (batchStockCount === 0) {
      const currentStocks = db.prepare(`
        SELECT cs.*, m.unit 
        FROM current_stock cs 
        JOIN medicines m ON cs.medicine_id = m.id
      `).all();

      const insertBatchStmt = db.prepare(`
        INSERT OR IGNORE INTO centre_batch_stock (
          id, phc_id, medicine_id, batch_number, expiry_date, quantity, unit, status, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `);

      currentStocks.forEach(cs => {
        const batchNum = cs.batch_number || `TN-BATCH-${cs.medicine_id.toUpperCase().slice(-3)}`;
        const expDate = cs.expiry_date || '2027-10-31';
        const batchId = `cbs-${cs.phc_id}-${cs.medicine_id}-${batchNum}`;
        insertBatchStmt.run(batchId, cs.phc_id, cs.medicine_id, batchNum, expDate, cs.quantity, cs.unit || 'units', cs.last_updated || new Date().toISOString());
      });
    }

  } catch (e) {
    console.error('Error migrating billing and stock schema:', e);
  }
}

initSchema();

module.exports = {
  db,
  initSchema
};
