const bcrypt = require('bcryptjs');
const { db } = require('./database');
const { MIN_CENTRES_PER_DISTRICT, MAX_CENTRES_PER_DISTRICT } = require('../config/districtCentresConfig');
const centresData = require('../config/allCentresData.json');

function seedDatabase() {
  console.log('🌱 Starting database seeding for MediSync PHC (All 38 Tamil Nadu Districts)...');

  db.exec('BEGIN TRANSACTION;');
  try {
    // Clear existing data in reverse order of foreign keys
    try { db.exec('DELETE FROM bill_items;'); } catch (e) {}
    try { db.exec('DELETE FROM bills;'); } catch (e) {}
    try { db.exec('DELETE FROM stock_movements;'); } catch (e) {}
    try { db.exec('DELETE FROM centre_batch_stock;'); } catch (e) {}
    try { db.exec('DELETE FROM transfer_recommendations;'); } catch (e) {}
    try { db.exec('DELETE FROM stock_reservations;'); } catch (e) {}
    try { db.exec('DELETE FROM background_jobs;'); } catch (e) {}
    try { db.exec('DELETE FROM notifications;'); } catch (e) {}
    db.exec('DELETE FROM notification_dispatches;');
    db.exec('DELETE FROM audit_logs;');
    db.exec('DELETE FROM emergency_indents;');
    db.exec('DELETE FROM transfer_requests;');
    db.exec('DELETE FROM alerts;');
    db.exec('DELETE FROM stock_entries;');
    db.exec('DELETE FROM current_stock;');
    db.exec('DELETE FROM batches;');
    db.exec('DELETE FROM medicines;');
    db.exec('DELETE FROM users;');
    db.exec('DELETE FROM phcs;');

    // 1. Insert 133 Health Centres and 38 District Drug Warehouses across ALL 38 Districts
    const phcs = [...centresData.centres, ...centresData.warehouses];

    // Validation: a district cannot exist, or be left, with fewer than 3 or more than 4 active centres
    const activeCentreCountsByDistrict = {};
    phcs.forEach(p => {
      if (!p.is_warehouse && p.facility_type !== 'DISTRICT') {
        activeCentreCountsByDistrict[p.district] = (activeCentreCountsByDistrict[p.district] || 0) + 1;
      }
    });

    for (const [dist, count] of Object.entries(activeCentreCountsByDistrict)) {
      if (count < MIN_CENTRES_PER_DISTRICT) {
        throw new Error(`A district needs at least ${MIN_CENTRES_PER_DISTRICT} centres (found ${count} in ${dist})`);
      }
      if (count > MAX_CENTRES_PER_DISTRICT) {
        throw new Error(`A district can have at most ${MAX_CENTRES_PER_DISTRICT} centres (found ${count} in ${dist})`);
      }
    }

    const insertPhc = db.prepare(`
      INSERT INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone, cold_chain_equipped, contact_person, address, facility_type, is_warehouse)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    phcs.forEach(p => {
      insertPhc.run(
        p.id, p.name, p.code, p.block, p.district, p.latitude, p.longitude,
        p.population_served || 35000, p.phone || '+91 94431 22000',
        p.cold_chain_equipped !== undefined ? p.cold_chain_equipped : 1,
        p.contact_person || 'Medical Officer on Duty',
        p.address || `${p.name}, ${p.district}`,
        p.facility_type || 'PHC',
        p.is_warehouse ? 1 : 0
      );
    });
    console.log(`✅ Seeded ${phcs.length} healthcare facilities (133 centres across 38 districts + 38 district drug warehouses).`);

    // 2. Insert Users for each Role
    const passwordHash = bcrypt.hashSync('password123', 10);
    const users = [
      {
        id: 'usr-pharm-tpr',
        name: 'Thiru. Murugan (Pharmacist)',
        email: 'pharmacist@thiruporur.phc.gov.in',
        password_hash: passwordHash,
        role: 'pharmacist',
        phc_id: 'phc-thiruporur',
        phone: '+91 98401 11001'
      },
      {
        id: 'usr-mo-tpr',
        name: 'Dr. S. Kaviya (Medical Officer)',
        email: 'mo@thiruporur.phc.gov.in',
        password_hash: passwordHash,
        role: 'medical_officer',
        phc_id: 'phc-thiruporur',
        phone: '+91 98401 11002'
      },
      {
        id: 'usr-pharm-klm',
        name: 'Thiru. Selvam (Pharmacist)',
        email: 'pharmacist@kelambakkam.phc.gov.in',
        password_hash: passwordHash,
        role: 'pharmacist',
        phc_id: 'phc-kelambakkam',
        phone: '+91 98401 11003'
      },
      {
        id: 'usr-mo-klm',
        name: 'Dr. M. Vignesh (Medical Officer)',
        email: 'mo@kelambakkam.phc.gov.in',
        password_hash: passwordHash,
        role: 'medical_officer',
        phc_id: 'phc-kelambakkam',
        phone: '+91 98401 11004'
      },
      {
        id: 'usr-bmo-tpr',
        name: 'Dr. Jayanthi Raman (Block Medical Officer)',
        email: 'bmo@thiruporur.block.gov.in',
        password_hash: passwordHash,
        role: 'block_officer',
        phc_id: 'phc-thiruporur',
        phone: '+91 98401 11005'
      },
      {
        id: 'usr-admin-chengalpattu',
        name: 'Dr. A. Sundararajan (Deputy Director of Health Services - DDHS)',
        email: 'admin@chengalpattu.health.gov.in',
        password_hash: passwordHash,
        role: 'district_admin',
        phc_id: null,
        phone: '+91 98401 11000'
      },
      {
        id: 'usr-system-automation',
        name: 'MediAlert AI Automation Engine',
        email: 'automation@medsync.gov.in',
        password_hash: 'sys_hash',
        role: 'district_admin',
        phc_id: null,
        phone: '+91 94431 00000'
      }
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, phc_id, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    users.forEach(u => {
      insertUser.run(u.id, u.name, u.email, u.password_hash, u.role, u.phc_id, u.phone);
    });
    console.log(`✅ Seeded ${users.length} users with distinct roles.`);

    // 3. Insert 30 Common Medicines
    const medicines = [
      {
        id: 'med-pcm-syp',
        name: 'Paracetamol Pediatric Oral Suspension',
        generic_name: 'Paracetamol',
        category: 'Analgesics & Antipyretics',
        form: 'Oral Suspension',
        strength: '120mg/5ml',
        unit: 'Bottles (60ml)',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 21,
        seasonal_disease: 'Monsoon Viral Fevers, Dengue Season',
        description: 'First-line pediatric antipyretic for fevers and post-immunization'
      },
      {
        id: 'med-pcm-500',
        name: 'Paracetamol Tablets IP',
        generic_name: 'Paracetamol',
        category: 'Analgesics & Antipyretics',
        form: 'Tablet',
        strength: '500mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 21,
        seasonal_disease: 'Monsoon Viral Fevers',
        description: 'First-line adult analgesic and antipyretic'
      },
      {
        id: 'med-ors',
        name: 'Oral Rehydration Salts (ORS) WHO Formula',
        generic_name: 'Oral Rehydration Salts',
        category: 'Maternal & Child Health',
        form: 'Sachet',
        strength: '20.5g for 1L',
        unit: 'Sachets',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: 'Summer Dehydration & Acute Diarrheal Disease (ADD)',
        description: 'WHO recommended formulation for prevention and treatment of dehydration'
      },
      {
        id: 'med-amox-syp',
        name: 'Amoxicillin Oral Suspension',
        generic_name: 'Amoxicillin',
        category: 'Antibiotics',
        form: 'Dry Powder for Suspension',
        strength: '125mg/5ml',
        unit: 'Bottles (60ml)',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 21,
        seasonal_disease: 'Winter Respiratory Infections, Bronchitis',
        description: 'Broad-spectrum beta-lactam antibiotic for pediatric respiratory tract infections'
      },
      {
        id: 'med-amox-500',
        name: 'Amoxicillin Capsules IP',
        generic_name: 'Amoxicillin',
        category: 'Antibiotics',
        form: 'Capsule',
        strength: '500mg',
        unit: 'Capsules',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: 'Bacterial ENT & Skin Infections',
        description: 'Standard broad spectrum antibiotic'
      },
      {
        id: 'med-ifa-tab',
        name: 'Iron and Folic Acid Tablets (IFA Large)',
        generic_name: 'Ferrous Sulphate + Folic Acid',
        category: 'Maternal & Child Health',
        form: 'Coated Tablet',
        strength: '100mg elemental Iron + 500mcg Folic Acid',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 60,
        critical_buffer_days: 30,
        seasonal_disease: null,
        description: 'National Anemia Mukt Bharat antenatal supplementation'
      },
      {
        id: 'med-ifa-syp',
        name: 'Iron and Folic Acid Syrup',
        generic_name: 'Iron & Folic Acid',
        category: 'Maternal & Child Health',
        form: 'Syrup',
        strength: '20mg elemental Iron/ml',
        unit: 'Bottles (50ml)',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: null,
        description: 'Pediatric prophylactic iron syrup with auto-dispenser'
      },
      {
        id: 'med-metformin',
        name: 'Metformin Hydrochloride Tablets IP',
        generic_name: 'Metformin',
        category: 'Non-Communicable Diseases (NCD)',
        form: 'Tablet',
        strength: '500mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: null,
        description: 'First-line biguanide antihyperglycemic for Type-2 Diabetes under Makkalai Thedi Maruthuvam'
      },
      {
        id: 'med-glibenclamide',
        name: 'Glibenclamide Tablets IP',
        generic_name: 'Glibenclamide',
        category: 'Non-Communicable Diseases (NCD)',
        form: 'Tablet',
        strength: '5mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: null,
        description: 'Sulfonylurea oral hypoglycemic'
      },
      {
        id: 'med-amlodipine',
        name: 'Amlodipine Besylate Tablets IP',
        generic_name: 'Amlodipine',
        category: 'Non-Communicable Diseases (NCD)',
        form: 'Tablet',
        strength: '5mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: null,
        description: 'Calcium channel blocker for essential hypertension'
      },
      {
        id: 'med-enalapril',
        name: 'Enalapril Maleate Tablets IP',
        generic_name: 'Enalapril',
        category: 'Non-Communicable Diseases (NCD)',
        form: 'Tablet',
        strength: '5mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: null,
        description: 'ACE inhibitor antihypertensive'
      },
      {
        id: 'med-insulin-reg',
        name: 'Human Regular Soluble Insulin Injection',
        generic_name: 'Regular Insulin (rDNA)',
        category: 'Cold-Chain Biologicals',
        form: 'Vial (10ml)',
        strength: '40 IU/ml',
        unit: 'Vials',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 20,
        seasonal_disease: null,
        description: 'Short-acting regular insulin requiring strict 2-8°C cold chain storage'
      },
      {
        id: 'med-insulin-nph',
        name: 'Isophane Insulin (NPH) Suspension',
        generic_name: 'Isophane Insulin (rDNA)',
        category: 'Cold-Chain Biologicals',
        form: 'Vial (10ml)',
        strength: '40 IU/ml',
        unit: 'Vials',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 20,
        seasonal_disease: null,
        description: 'Intermediate-acting isophane insulin requiring cold chain maintenance'
      },
      {
        id: 'med-asv',
        name: 'Anti-Snake Venom (ASV) Serum Polyvalent',
        generic_name: 'Polyvalent Antivenom',
        category: 'Emergency & Antidotes',
        form: 'Vial (Lyophilized)',
        strength: '10ml reconstituted',
        unit: 'Vials',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 35,
        critical_buffer_days: 25,
        seasonal_disease: 'Monsoon Harvest Season Bites (Viper / Krait / Cobra)',
        description: 'Life-saving polyvalent antivenom neutralizing Big Four venomous snakes'
      },
      {
        id: 'med-tt',
        name: 'Tetanus Toxoid Vaccine IP',
        generic_name: 'Tetanus Toxoid',
        category: 'Cold-Chain Biologicals',
        form: 'Ampoule (0.5ml)',
        strength: '5 LF / 0.5ml',
        unit: 'Ampoules',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: 'Agricultural Trauma, Monsoon Injuries',
        description: 'Routine wound prophylaxis and maternal immunization'
      },
      {
        id: 'med-pentavalent',
        name: 'Pentavalent Vaccine (DPT-HepB-Hib)',
        generic_name: 'Pentavalent Vaccine',
        category: 'Cold-Chain Biologicals',
        form: 'Vial (10 doses)',
        strength: '10 doses/vial',
        unit: 'Vials',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 20,
        seasonal_disease: null,
        description: 'National Immunization Schedule essential biological'
      },
      {
        id: 'med-bopv',
        name: 'Bivalent Oral Polio Vaccine (bOPV)',
        generic_name: 'Poliovirus Vaccine (Type 1 & 3)',
        category: 'Cold-Chain Biologicals',
        form: 'Dropper Vial (20 doses)',
        strength: '20 doses',
        unit: 'Vials',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: null,
        description: 'Sub-zero / 2-8°C oral polio vaccine with VVM indicator'
      },
      {
        id: 'med-mr',
        name: 'Measles-Rubella (MR) Vaccine',
        generic_name: 'Live Attenuated MR Vaccine',
        category: 'Cold-Chain Biologicals',
        form: 'Vial with Diluent',
        strength: '10 doses',
        unit: 'Vials',
        cold_chain_flag: 1,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 20,
        seasonal_disease: null,
        description: 'Lyophilized pediatric biological requiring cold chain and dark storage'
      },
      {
        id: 'med-cetirizine',
        name: 'Cetirizine Hydrochloride Tablets IP',
        generic_name: 'Cetirizine',
        category: 'Antihistamines',
        form: 'Tablet',
        strength: '10mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: 'Pollen Allergy & Allergic Rhinitis',
        description: 'Second-generation H1 antagonist'
      },
      {
        id: 'med-azithromycin',
        name: 'Azithromycin Tablets IP',
        generic_name: 'Azithromycin',
        category: 'Antibiotics',
        form: 'Tablet',
        strength: '500mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: 'Atypical Respiratory Pathogens',
        description: 'Macrolide antibacterial'
      },
      {
        id: 'med-cipro-drops',
        name: 'Ciprofloxacin Ophthalmic / Otic Solution',
        generic_name: 'Ciprofloxacin',
        category: 'Ophthalmic / Otic',
        form: 'Eye / Ear Drops',
        strength: '0.3% w/v',
        unit: 'Bottles',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: 'Monsoon Conjunctivitis ("Madras Eye")',
        description: 'Fluoroquinolone topical anti-infective'
      },
      {
        id: 'med-salbutamol',
        name: 'Salbutamol Metered Dose Inhaler',
        generic_name: 'Salbutamol (Albuterol)',
        category: 'Respiratory',
        form: 'Inhaler Canister',
        strength: '100mcg/actuation',
        unit: 'Inhalers',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: 'Winter Smog & Bronchial Asthma Exacerbations',
        description: 'Rapid-acting beta-2 agonist bronchodilator'
      },
      {
        id: 'med-albendazole',
        name: 'Albendazole Chewable Tablets IP',
        generic_name: 'Albendazole',
        category: 'Anthelmintics',
        form: 'Chewable Tablet',
        strength: '400mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 60,
        critical_buffer_days: 30,
        seasonal_disease: 'National Deworming Day Mass Distribution',
        description: 'Broad-spectrum anthelmintic'
      },
      {
        id: 'med-zinc',
        name: 'Zinc Sulphate Dispersible Tablets IP',
        generic_name: 'Zinc Sulphate',
        category: 'Maternal & Child Health',
        form: 'Dispersible Tablet',
        strength: '20mg elemental Zinc',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 25,
        seasonal_disease: 'Pediatric Acute Diarrhea Management',
        description: 'Co-prescribed with ORS for 14 days in pediatric diarrhea'
      },
      {
        id: 'med-dexamethasone',
        name: 'Dexamethasone Sodium Phosphate Injection',
        generic_name: 'Dexamethasone',
        category: 'Emergency & Antidotes',
        form: 'Vial (2ml)',
        strength: '4mg/ml',
        unit: 'Vials',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 30,
        critical_buffer_days: 20,
        seasonal_disease: 'Severe Anaphylaxis & Acute Laryngeal Edema',
        description: 'Potent systemic corticosteroid for acute emergencies'
      },
      {
        id: 'med-adrenaline',
        name: 'Adrenaline (Epinephrine) Injection IP',
        generic_name: 'Adrenaline',
        category: 'Emergency & Antidotes',
        form: 'Ampoule (1ml)',
        strength: '1:1000 (1mg/ml)',
        unit: 'Ampoules',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 30,
        seasonal_disease: 'AEFI Anaphylaxis Response Kits',
        description: 'Primary first-line resuscitative adrenergic agonist'
      },
      {
        id: 'med-atropine',
        name: 'Atropine Sulphate Injection IP',
        generic_name: 'Atropine',
        category: 'Emergency & Antidotes',
        form: 'Ampoule (1ml)',
        strength: '0.6mg/ml',
        unit: 'Ampoules',
        cold_chain_flag: 0,
        critical_flag: 1,
        standard_buffer_days: 45,
        critical_buffer_days: 30,
        seasonal_disease: 'Agricultural Organophosphate Poisoning Emergency',
        description: 'Antimuscarinic antidote for pesticide toxic ingestion'
      },
      {
        id: 'med-calcium-d3',
        name: 'Calcium and Vitamin D3 Tablets',
        generic_name: 'Calcium Carbonate + Cholecalciferol',
        category: 'Supplements',
        form: 'Tablet',
        strength: '500mg elemental Ca + 250 IU Vit D3',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 45,
        critical_buffer_days: 20,
        seasonal_disease: null,
        description: 'Maternal antenatal bone health supplementation'
      },
      {
        id: 'med-pantoprazole',
        name: 'Pantoprazole Gastro-Resistant Tablets IP',
        generic_name: 'Pantoprazole',
        category: 'Gastrointestinal',
        form: 'Tablet',
        strength: '40mg',
        unit: 'Tablets',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: null,
        description: 'Proton-pump inhibitor for acid peptic disease'
      },
      {
        id: 'med-povidone',
        name: 'Povidone-Iodine Solution IP 5% w/v',
        generic_name: 'Povidone Iodine',
        category: 'Surgical & Antiseptics',
        form: 'Topical Solution',
        strength: '5% w/v',
        unit: 'Bottles',
        cold_chain_flag: 0,
        critical_flag: 0,
        standard_buffer_days: 30,
        critical_buffer_days: 15,
        seasonal_disease: 'Trauma & Wound Dressing',
        description: 'Broad-spectrum microbicidal surgical antiseptic'
      }
    ];

    const insertMedicine = db.prepare(`
      INSERT INTO medicines (id, name, generic_name, category, form, strength, unit, cold_chain_flag, critical_flag, standard_buffer_days, critical_buffer_days, seasonal_disease, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    medicines.forEach(m => {
      insertMedicine.run(
        m.id, m.name, m.generic_name, m.category, m.form, m.strength, m.unit,
        m.cold_chain_flag, m.critical_flag, m.standard_buffer_days, m.critical_buffer_days,
        m.seasonal_disease, m.description
      );
    });
    console.log(`✅ Seeded ${medicines.length} essential medicines conforming to TNMSC EDL.`);

    // 4. Seed Current Stock, Batches, and Stock History
    const insertCurrentStock = db.prepare(`
      INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'))
    `);

    const insertBatch = db.prepare(`
      INSERT OR IGNORE INTO batches (id, medicine_id, batch_number, expiry_date, manufacturer)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertBatchStock = db.prepare(`
      INSERT OR REPLACE INTO centre_batch_stock (id, phc_id, medicine_id, batch_number, expiry_date, quantity, unit, status, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now', '-2 hours'))
    `);

    const insertStockEntry = db.prepare(`
      INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, created_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    // Seed District Drug Warehouses with district reserves
    centresData.warehouses.forEach(wh => {
      medicines.slice(0, 12).forEach(med => {
        const qty = 1500 + Math.floor(Math.random() * 1000);
        const batchNum = `TN-WH-${wh.code}-${med.id.replace('med-', '').toUpperCase()}-2027`;
        const expDate = '2027-10-31';

        insertCurrentStock.run(`cs-${wh.id}-${med.id}`, wh.id, med.id, qty, batchNum, expDate);
        insertBatch.run(`batch-${wh.id}-${batchNum}`, med.id, batchNum, expDate, 'TNMSC Central Logistics');
        insertBatchStock.run(`cbs-${wh.id}-${med.id}-${batchNum}`, wh.id, med.id, batchNum, expDate, qty, med.unit || 'units');
      });
    });

    const base10Ids = [
      'phc-thiruporur', 'phc-kelambakkam', 'phc-nemmeli', 'phc-kovalam',
      'phc-alathur', 'phc-madurantakam', 'phc-acharpakkam',
      'phc-karunguzhi', 'phc-nandivaram', 'phc-kundrathur'
    ];

    let entryCount = 0;

    // Seed Health Centres (Centres 1-10 + Generated 11-133)
    centresData.centres.forEach((phc, pIdx) => {
      const isBase10 = base10Ids.includes(phc.id);
      const medsToSeed = isBase10 ? medicines : medicines.slice(0, 12);
      const daysOfHistory = isBase10 ? 90 : 14;

      medsToSeed.forEach(med => {
        const popFactor = (phc.population_served || 35000) / 40000;
        let baseDailyUsage = 0;

        if (med.id === 'med-pcm-syp') baseDailyUsage = Math.round(14 * popFactor);
        else if (med.id === 'med-pcm-500') baseDailyUsage = Math.round(85 * popFactor);
        else if (med.id === 'med-ors') baseDailyUsage = Math.round(25 * popFactor);
        else if (med.id === 'med-amox-syp') baseDailyUsage = Math.round(10 * popFactor);
        else if (med.id === 'med-ifa-tab') baseDailyUsage = Math.round(50 * popFactor);
        else if (med.id === 'med-metformin') baseDailyUsage = Math.round(65 * popFactor);
        else if (med.id === 'med-amlodipine') baseDailyUsage = Math.round(60 * popFactor);
        else if (med.id === 'med-asv') baseDailyUsage = 0.5 * popFactor;
        else if (med.id === 'med-insulin-reg') baseDailyUsage = Math.round(3 * popFactor);
        else baseDailyUsage = Math.max(1, Math.round(8 * popFactor));

        let currentQty = 0;
        let isStockoutScenario = false;
        let isSurplusScenario = false;

        // Base 10 specific targeted scenarios
        if (phc.id === 'phc-thiruporur' && med.id === 'med-pcm-syp') {
          currentQty = 8; // 2 days / critical
          isStockoutScenario = true;
        } else if (phc.id === 'phc-kelambakkam' && med.id === 'med-pcm-syp') {
          currentQty = 1200; // safe surplus
          isSurplusScenario = true;
        } else if (phc.id === 'phc-nemmeli' && med.id === 'med-asv') {
          currentQty = 2; // Critical low ASV
          isStockoutScenario = true;
        } else if (phc.id === 'phc-thiruporur' && med.id === 'med-asv') {
          currentQty = 35; // Surplus ASV
          isSurplusScenario = true;
        } else if (phc.id === 'phc-alathur' && med.id === 'med-amox-syp') {
          currentQty = 9; // Critical low Amox
          isStockoutScenario = true;
        } else if (phc.id === 'phc-kelambakkam' && med.id === 'med-amox-syp') {
          currentQty = 650; // Surplus Amox
          isSurplusScenario = true;
        } else if (phc.id === 'phc-kovalam' && med.id === 'med-ors') {
          currentQty = 35; // Critical low ORS
          isStockoutScenario = true;
        } else if (phc.id === 'phc-madurantakam' && med.id === 'med-ors') {
          currentQty = 1500; // Surplus ORS
          isSurplusScenario = true;
        } else {
          // Deterministic distribution across 35 other districts
          const hashVal = (pIdx * 17 + med.id.length * 31) % 100;
          if (hashVal < 8) {
            // ~8% Critical shortage
            currentQty = Math.max(2, Math.round(baseDailyUsage * 2));
            isStockoutScenario = true;
          } else if (hashVal < 22) {
            // ~14% Warning / Low buffer
            currentQty = Math.max(8, Math.round(baseDailyUsage * 12));
          } else if (hashVal > 85) {
            // ~15% High surplus
            currentQty = Math.round(baseDailyUsage * 45);
            isSurplusScenario = true;
          } else {
            // Normal healthy stock
            currentQty = Math.round(baseDailyUsage * 28);
          }
        }

        let runningStock = currentQty;
        const batchNum = `TN-${med.id.replace('med-', '').toUpperCase()}-${2025 + ((pIdx % 2 === 0) ? 1 : 2)}`;
        const expDate = isStockoutScenario ? '2026-11-20' : '2027-10-31';

        // Insert current_stock
        insertCurrentStock.run(`cs-${phc.id}-${med.id}`, phc.id, med.id, currentQty, batchNum, expDate);
        insertBatch.run(`batch-${phc.id}-${batchNum}`, med.id, batchNum, expDate, 'TNMSC Pharma Labs');
        insertBatchStock.run(`cbs-${phc.id}-${med.id}-${batchNum}`, phc.id, med.id, batchNum, expDate, currentQty, med.unit || 'units');

        // Insert daily stock entries
        for (let dayOffset = 0; dayOffset < daysOfHistory; dayOffset++) {
          const entryDateObj = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
          const entryDateStr = formatDate(entryDateObj);

          const month = entryDateObj.getMonth() + 1;
          const isMonsoon = (month >= 10 && month <= 12);
          const seasonalMultiplier = (isMonsoon && (med.id.includes('pcm') || med.id.includes('amox') || med.id.includes('asv'))) ? 1.45 : 1.0;

          let dispensed = Math.max(0, Math.round(baseDailyUsage * seasonalMultiplier));
          if (dispensed > runningStock && dayOffset === 0) dispensed = Math.min(runningStock, dispensed);

          let received = 0;
          if ((dayOffset === 14 || dayOffset === 30 || dayOffset === 60) && !isStockoutScenario) {
            received = Math.round(baseDailyUsage * 20);
          }

          const closing = runningStock;
          const opening = Math.max(0, closing + dispensed - received);

          insertStockEntry.run(
            `se-${phc.id}-${med.id}-${entryDateStr}`,
            phc.id,
            med.id,
            entryDateStr,
            opening,
            received,
            dispensed,
            closing,
            batchNum,
            expDate,
            'usr-pharm-tpr',
            dayOffset === 0 ? 'Daily physical count verified' : null
          );
          entryCount++;
        }
      });
    });

    console.log(`✅ Seeded inventory & ${entryCount} stock history records across all facilities.`);

    // 5. Seed Alerts (Triggered by stock calculations)
    const alerts = [
      {
        id: 'alt-001',
        phc_id: 'phc-thiruporur',
        medicine_id: 'med-pcm-syp',
        alert_type: 'stockout_imminent',
        severity: 'critical',
        days_left: 0.5,
        message: 'CRITICAL STOCK-OUT IMMINENT: Paracetamol Pediatric Suspension has only 8 bottles remaining (~0.5 days of supply left). Daily usage is 16 bottles/day due to monsoon viral fever surge.',
        status: 'new'
      },
      {
        id: 'alt-002',
        phc_id: 'phc-nemmeli',
        medicine_id: 'med-asv',
        alert_type: 'below_threshold',
        severity: 'critical',
        days_left: 3.2,
        message: 'EMERGENCY ANTIDOTE ALERT: Anti-Snake Venom (ASV) is at 2 vials. Critical threshold buffer requires at least 25 days of reserve.',
        status: 'new'
      },
      {
        id: 'alt-003',
        phc_id: 'phc-alathur',
        medicine_id: 'med-amox-syp',
        alert_type: 'stockout_imminent',
        severity: 'critical',
        days_left: 1.1,
        message: 'Amoxicillin Oral Suspension critically low: 9 bottles left at current consumption rate of 8 bottles/day.',
        status: 'new'
      },
      {
        id: 'alt-004',
        phc_id: 'phc-kovalam',
        medicine_id: 'med-ors',
        alert_type: 'below_threshold',
        severity: 'warning',
        days_left: 2.1,
        message: 'Oral Rehydration Salts (ORS) below emergency reserve (35 sachets left, daily consumption is 17 sachets).',
        status: 'acknowledged'
      },
      {
        id: 'alt-005',
        phc_id: 'phc-thiruporur',
        medicine_id: 'med-pcm-syp',
        alert_type: 'rapid_consumption',
        severity: 'warning',
        days_left: 0.5,
        message: 'ANOMALY DETECTED: Paracetamol Syrup consumption spiked 142% above 30-day baseline over last 4 days (Z-Score: +2.84).',
        status: 'new'
      },
      {
        id: 'alt-006',
        phc_id: 'phc-kelambakkam',
        medicine_id: 'med-pcm-syp',
        alert_type: 'near_expiry',
        severity: 'warning',
        days_left: 45.0,
        message: 'EXPIRY WARNING: Batch TNMSC-PCM-23K (75 bottles) expires in 36 days. Recommended for priority redistribution.',
        status: 'new'
      }
    ];

    const insertAlert = db.prepare(`
      INSERT INTO alerts (id, phc_id, medicine_id, alert_type, severity, days_left, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'))
    `);

    alerts.forEach(a => {
      insertAlert.run(a.id, a.phc_id, a.medicine_id, a.alert_type, a.severity, a.days_left, a.message, a.status);
    });
    console.log(`✅ Seeded ${alerts.length} active alerts with clinical urgency.`);

    // 6. Seed Sample Transfer Requests showing lifecycle
    const transfers = [
      {
        id: 'trf-001',
        req_number: 'TRF-TN-2026-0081',
        source_phc_id: 'phc-kelambakkam',
        dest_phc_id: 'phc-thiruporur',
        medicine_id: 'med-pcm-syp',
        quantity: 120,
        reason: 'Urgent stock-out prevention for pediatric viral fever surge; source has 460 bottles surplus (7.8 km distance)',
        status: 'requested',
        cold_chain_arranged: 0,
        requested_by: 'usr-pharm-tpr',
        notes: 'Generated via MediSync AI Redistribution Recommender'
      },
      {
        id: 'trf-002',
        req_number: 'TRF-TN-2026-0079',
        source_phc_id: 'phc-thiruporur',
        dest_phc_id: 'phc-nemmeli',
        medicine_id: 'med-asv',
        quantity: 10,
        reason: 'Emergency Antidote buffer rebalance for coastal snakebite trauma unit',
        status: 'approved',
        cold_chain_arranged: 1,
        requested_by: 'usr-pharm-tpr',
        notes: 'Approved by Dr. S. Kaviya, MO. Cold-chain vaccine carrier box arranged with ice packs.'
      },
      {
        id: 'trf-003',
        req_number: 'TRF-TN-2026-0065',
        source_phc_id: 'phc-kelambakkam',
        dest_phc_id: 'phc-kovalam',
        medicine_id: 'med-ors',
        quantity: 150,
        reason: 'Replenishment for acute gastroenteritis cluster in fishing village',
        status: 'completed',
        cold_chain_arranged: 0,
        requested_by: 'usr-pharm-klm',
        notes: 'Transfer verified and received by Kovalam PHC.'
      }
    ];

    const insertTransfer = db.prepare(`
      INSERT INTO transfer_requests (id, req_number, source_phc_id, dest_phc_id, medicine_id, quantity, reason, status, cold_chain_arranged, requested_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    transfers.forEach(t => {
      insertTransfer.run(t.id, t.req_number, t.source_phc_id, t.dest_phc_id, t.medicine_id, t.quantity, t.reason, t.status, t.cold_chain_arranged, t.requested_by, t.notes);
    });
    console.log(`✅ Seeded ${transfers.length} inter-PHC transfer requests.`);

    // 7. Seed Emergency Indents to District Warehouse
    const indents = [
      {
        id: 'ind-001',
        indent_number: 'IND-CGP-2026-0014',
        phc_id: 'phc-thiruporur',
        medicine_id: 'med-pcm-syp',
        requested_quantity: 400,
        reason: 'Monsoon pediatric fever surge - district cycle order not due for 18 days',
        consumption_rate: 16.2,
        status: 'submitted',
        created_by: 'usr-mo-tpr',
        notes: 'Auto-drafted by MediSync AI Indent Forecaster based on 48,000 population and rising fever incidence'
      },
      {
        id: 'ind-002',
        indent_number: 'IND-CGP-2026-0011',
        phc_id: 'phc-madurantakam',
        medicine_id: 'med-insulin-reg',
        requested_quantity: 60,
        reason: 'Increase in newly diagnosed diabetic patients enrolled under Makkalai Thedi Maruthuvam',
        consumption_rate: 4.8,
        status: 'approved',
        created_by: 'usr-pharm-klm',
        notes: 'Approved by District Drug Warehouse Manager'
      }
    ];

    const insertIndent = db.prepare(`
      INSERT INTO emergency_indents (id, indent_number, phc_id, medicine_id, requested_quantity, reason, consumption_rate, status, created_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    indents.forEach(i => {
      insertIndent.run(i.id, i.indent_number, i.phc_id, i.medicine_id, i.requested_quantity, i.reason, i.consumption_rate, i.status, i.created_by, i.notes);
    });
    console.log(`✅ Seeded ${indents.length} emergency indents.`);

    console.log('🎉 38-District Seeding successfully completed for MediSync PHC!');
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('❌ Seeding failed, rolled back:', err);
    throw err;
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
