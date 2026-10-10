-- MediSync PHC Database Schema
-- SQLite3 Compatible

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('pharmacist', 'medical_officer', 'block_officer', 'district_admin')),
    phc_id TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phcs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    block TEXT NOT NULL,
    district TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    population_served INTEGER NOT NULL,
    phone TEXT NOT NULL,
    cold_chain_equipped INTEGER DEFAULT 1,
    contact_person TEXT,
    address TEXT
);

CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    generic_name TEXT NOT NULL,
    category TEXT NOT NULL,
    form TEXT NOT NULL,
    strength TEXT NOT NULL,
    unit TEXT NOT NULL,
    cold_chain_flag INTEGER DEFAULT 0,
    critical_flag INTEGER DEFAULT 0,
    standard_buffer_days INTEGER DEFAULT 30,
    critical_buffer_days INTEGER DEFAULT 21,
    seasonal_disease TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    medicine_id TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    manufacturer TEXT,
    FOREIGN KEY(medicine_id) REFERENCES medicines(id)
);

CREATE TABLE IF NOT EXISTS current_stock (
    id TEXT PRIMARY KEY,
    phc_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    batch_number TEXT,
    expiry_date DATE,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(phc_id) REFERENCES phcs(id),
    FOREIGN KEY(medicine_id) REFERENCES medicines(id),
    UNIQUE(phc_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS stock_entries (
    id TEXT PRIMARY KEY,
    phc_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    entry_date DATE NOT NULL,
    opening_stock INTEGER NOT NULL,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    dispensed_quantity INTEGER NOT NULL DEFAULT 0,
    closing_stock INTEGER NOT NULL,
    batch_number TEXT,
    expiry_date DATE,
    created_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(phc_id) REFERENCES phcs(id),
    FOREIGN KEY(medicine_id) REFERENCES medicines(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    phc_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('stockout_imminent', 'below_threshold', 'rapid_consumption', 'near_expiry', 'anomaly_detected')),
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),
    days_left REAL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'acknowledged', 'resolved')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    acknowledged_by TEXT,
    acknowledged_at DATETIME,
    resolved_at DATETIME,
    FOREIGN KEY(phc_id) REFERENCES phcs(id),
    FOREIGN KEY(medicine_id) REFERENCES medicines(id)
);

CREATE TABLE IF NOT EXISTS transfer_requests (
    id TEXT PRIMARY KEY,
    req_number TEXT UNIQUE NOT NULL,
    source_phc_id TEXT NOT NULL,
    dest_phc_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested', 'approved', 'in_transit', 'received', 'completed', 'rejected')),
    cold_chain_arranged INTEGER DEFAULT 0,
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    source_approved_at DATETIME,
    dispatch_date DATETIME,
    receipt_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY(source_phc_id) REFERENCES phcs(id),
    FOREIGN KEY(dest_phc_id) REFERENCES phcs(id),
    FOREIGN KEY(medicine_id) REFERENCES medicines(id),
    FOREIGN KEY(requested_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS emergency_indents (
    id TEXT PRIMARY KEY,
    indent_number TEXT UNIQUE NOT NULL,
    phc_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    requested_quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    consumption_rate REAL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted', 'approved', 'dispatched', 'delivered', 'rejected')),
    created_by TEXT NOT NULL,
    approved_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_expected DATE,
    notes TEXT,
    FOREIGN KEY(phc_id) REFERENCES phcs(id),
    FOREIGN KEY(medicine_id) REFERENCES medicines(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_dispatches (
    id TEXT PRIMARY KEY,
    recipient_phone TEXT NOT NULL,
    channel TEXT NOT NULL CHECK(channel IN ('sms', 'whatsapp')),
    alert_id TEXT,
    message TEXT NOT NULL,
    dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'sent'
);
