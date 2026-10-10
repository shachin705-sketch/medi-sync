# 🏥 VelocityRx + Block Exchange

> **Tagline:** Predict Shortages. Share Safely. Deliver Faster.

**VelocityRx + Block Exchange** is a full-stack medicine stock forecasting, donor matching, and safe redistribution platform built for Primary Health Centres (PHCs) and Community Health Centres (CHCs) in Chengalpattu District, Tamil Nadu.

Healthcare centres order medicines on fixed monthly cycles. When acute consumption surges occur (e.g. monsoon viral fever outbreaks or heatwave dehydration clusters), facilities risk running out of essential drugs unnoticed while neighboring facilities hold transferable surplus.

VelocityRx connects facilities via an algorithmic peer-to-peer exchange that predicts stockouts, calculates before-and-after stock impacts for both donor and receiver, protects local safety reserves, applies FEFO batch prioritization, and tracks physical custody from dispatch to verified receipt.

---

## 🌟 Key Differentiators & Core Features

1. **Before-and-After Stock Impact Analysis (Mandatory Differentiator)**:
   - For every recommended or simulated transfer, computes the exact impact on **both** facilities:
     - **Donor Facility**: Usable stock, days of cover, projected stock after dispatch, projected days of cover after dispatch, and 14-day safety reserve status.
     - **Receiving Facility**: Usable stock, days of cover, projected stock after receipt, projected days of cover after receipt, remaining shortage, and clinical risk level transition.
   - Prohibits transfers that would drop donor stock below its 14-day minimum safety reserve.

2. **Interactive Transfer Impact Simulator (Dedicated Sandbox)**:
   - Side-by-side comparative panels for donor and receiving facilities.
   - Interactive slider and preset buttons to test any transfer volume.
   - Recalculates all impacts live without mutating database inventory.
   - Visual progress bars comparing stock retention and shortage resolution.

3. **Spatial Network Map**:
   - Interactive Leaflet map displaying 10 block health centres (9 PHCs + 1 CHC).
   - Color-coded status markers: **Red** (Critical shortage $\le 3$d), **Yellow** (Low stock 4-8d), **Green** (Safe/Surplus), **Grey** (Stale inventory $>24$h).
   - Anchored rich popups with **Inspect Inventory** (drawer) and **Request Medicine** actions.
   - Transfer routes rendered as dynamic polylines with road travel estimates.

4. **Multi-Medicine Dispensary Inventory Drawer**:
   - Live dispensary ledger with search across generic names and batch numbers.
   - Batch numbers, FEFO expiration dates, daily usage rates, days of cover, and safety reserve thresholds.

5. **End-to-End Custody Lifecycle with Partial Receipts**:
   - Status workflow: `Draft` &rarr; `Recommended` &rarr; `Requested` &rarr; `Approved` &rarr; `In Transit` (Dispatch) &rarr; `Completed` (Receipt).
   - **Atomic Donor Deduction**: Decrements donor stock at handover; prevents duplicate dispatch.
   - **Atomic Recipient Addition with Discrepancy Handling**: Increments receiving stock only for verified physical count (supporting partial receipts where units are damaged or lost in transit).
   - **Official Printable Transfer Voucher**: Standardized Government of Tamil Nadu Department of Public Health voucher with dispatch timestamps, batch numbers, and physical signature lines.

6. **FEFO & Batch Expiry Safeguards**:
   - Prioritizes earliest-expiring eligible batches (First Expiry, First Out).
   - Automatically excludes expired, recalled, or damaged lots.
   - Verifies that the receiving facility can realistically consume the transferred volume before batch expiration.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, React Router, Recharts, Leaflet, Lucide Icons |
| **Backend** | Node.js 24, Express, REST API, Zod-compatible validation, centralised error handling |
| **Database** | Node 24 Native SQLite (`DatabaseSync`), WAL mode, foreign keys, additive migrations |
| **Testing** | Node.js Test Runner covering spatial calculations, stock risk, safety buffers, partial receipts |
| **Security** | BCrypt password hashing, JWT authentication, Role-Based Access Control, audit logging |

---

## 👥 Demo User Credentials (Fictional Local Accounts)

All demo accounts use the standard password: `password123`

| Role | Email | Name & Facility |
| :--- | :--- | :--- |
| **Pharmacist** | `pharmacist@thiruporur.phc.gov.in` | Thiru. Murugan (Thiruporur PHC) |
| **Medical Officer** | `mo@thiruporur.phc.gov.in` | Dr. S. Kaviya, MO (Thiruporur PHC) |
| **Medical Officer (Donor)** | `mo@kelambakkam.phc.gov.in` | Dr. M. Vignesh, MO (Kelambakkam Upgraded CHC) |
| **Block Health Officer** | `bmo@thiruporur.block.gov.in` | Dr. Jayanthi Raman (Block Medical Officer) |
| **District Admin** | `admin@chengalpattu.health.gov.in` | Dr. A. Sundararajan (DDHS District Director) |

---

## 🚀 Quickstart & Setup Instructions

### Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+`

### 1. Start the Backend Server
```bash
cd server
npm install
npm run seed      # Seeds 10 centres, 30 essential medicines, historical entries, and batches
npm start         # Runs Express API at http://localhost:5000
```

### 2. Start the Frontend Development Server
```bash
cd client
npm install
npm run dev       # Runs Vite dev server at http://localhost:5173
```

### 3. Run the Unit & Integration Test Suite
```bash
cd server
npm test          # Runs calculations, transfer safety, FEFO, and partial receipt tests
```

### 4. Build Production Frontend Bundle
```bash
cd client
npm run build     # Verifies production bundling with zero errors
```

---

## 🧪 Verified Demo Scenarios (Scenarios A through H)

- **Scenario A: Safe Local Transfer**
  - Centre A (Thiruporur) has a shortage of Paracetamol Syrup (2 days cover).
  - Centre B (Kelambakkam) has verified surplus (50 days cover, 400 units).
  - System recommends 120 units; shows donor retains 35 days buffer and receiver gains 26 days buffer.
  - Approved & dispatched &rarr; donor decrements to 280 units, receiver increments to 130 units.
- **Scenario B: Donor Reserve Protection**
  - Transfer proposal of 1100 units from Kelambakkam would deplete it below 14 days cover.
  - System blocks the proposal with visible alert: *"UNSAFE PROPOSAL BLOCKED: breaches mandatory 14-day safety reserve."*
- **Scenario C: No Available Donor (Unresolved Shortage Escalation)**
  - When no local facility holds safe surplus, system generates an escalation recommendation to the District Medical Drug Warehouse.
- **Scenario D: Expired Batch Exclusion**
  - Expired lots are automatically disqualified from transfer proposals.
- **Scenario E: Approaching Expiry (FEFO)**
  - Evaluates batch `TN-PCM-23K` expiring in 36 days and confirms receiver can consume the proposed quantity in time.
- **Scenario F: Partial Receipt & Discrepancies**
  - Receiving staff can confirm less than dispatched (e.g. 100 of 120 units due to transit damage).
  - Only confirmed quantity (100 units) increments recipient stock; discrepancy reason is logged in audit history.
- **Scenario G: Stale Inventory Indicator**
  - Facilities with reports $>24$h stale (e.g. Centre D Kovalam) are marked with grey indicators and excluded from verified donor surplus.
- **Scenario H: Simulation Without Database Mutation**
  - Interactive slider in Transfer Simulator dynamically recalculates impacts without altering database records.

---

## 📡 REST API Reference

### Health & System
- `GET /api/health` — Service health check & tagline
- `POST /api/auth/login` — Authenticate user and retrieve JWT token
- `GET /api/auth/me` — Retrieve active authenticated user session

### Dashboard
- `GET /api/dashboard/summary` — Master KPI metrics computed directly from SQLite
- `GET /api/dashboard/alerts` — Clinical and operational quick alerts
- `GET /api/dashboard/metrics` — Categorical and block-level breakdowns

### Health Centres
- `GET /api/centres` — List all 10 sample block centres with status & freshness
- `GET /api/centres/:id` — Single centre details with inventory overview
- `POST /api/centres` — Register new centre
- `PATCH /api/centres/:id` — Update centre details
- `DELETE /api/centres/:id` — Remove centre

### Inventory & Batches
- `GET /api/inventory` — Query inventory records with filters (status, centre, search)
- `GET /api/inventory/:id` — Single inventory record with movement history
- `POST /api/inventory/:id/receipts` — Atomically record stock receipts
- `POST /api/inventory/:id/issues` — Atomically record stock dispensation (prevents negative stock)
- `GET /api/batches` — List batches sorted by expiry (FEFO)

### Transfers & Simulation
- `POST /api/transfers/simulate` — Interactive sandbox calculating before-and-after metrics
- `POST /api/transfers/recommendations/generate` — Genuine recommendation engine evaluating donor surplus
- `GET /api/transfers` — List transfer requests
- `POST /api/transfers` — Create transfer request
- `POST /api/transfers/:id/approve` — Approve transfer proposal
- `POST /api/transfers/:id/reject` — Reject transfer with mandatory reason
- `POST /api/transfers/:id/dispatch` — Custody handover: atomically deducts donor stock
- `POST /api/transfers/:id/receive` — Confirm delivery receipt (supports partial receipts)
- `GET /api/transfers/:id/slip` — Printable transfer voucher slip data

---

## 📄 Prototype Notice
> **DEMO DATA NOTICE:** This prototype utilizes fictional health centres, sample inventories, and simulated spatial data for demonstration purposes in Chengalpattu Health District. Not connected to real patient health records or active hospital systems.
