const bcrypt = require('bcryptjs');
const { db } = require('./database');

function seedDatabase() {
  console.log('🌱 Starting database seeding for MediSync PHC (Chengalpattu District, TN)...');

  db.exec('BEGIN TRANSACTION;');
  try {
    // Clear existing data in reverse order of foreign keys
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

  // 1. Insert 15 PHCs in Chengalpattu District across 3 Blocks
  const phcs = [
    // Thiruporur Block
    {
      id: 'phc-thiruporur',
      name: 'Thiruporur PHC',
      code: 'PHC-TPR-01',
      block: 'Thiruporur Block',
      district: 'Chengalpattu',
      latitude: 12.7234,
      longitude: 80.1906,
      population_served: 48000,
      phone: '+91 94431 22001',
      cold_chain_equipped: 1,
      contact_person: 'Dr. S. Kaviya, MO',
      address: 'Main Road, Thiruporur, Chengalpattu - 603110'
    },
    {
      id: 'phc-kelambakkam',
      name: 'Kelambakkam Upgraded PHC',
      code: 'PHC-KLM-02',
      block: 'Thiruporur Block',
      district: 'Chengalpattu',
      latitude: 12.7904,
      longitude: 80.2223,
      population_served: 54000,
      phone: '+91 94431 22002',
      cold_chain_equipped: 1,
      contact_person: 'Dr. M. Vignesh, MO',
      address: 'OMR Junction, Kelambakkam, Chengalpattu - 603103'
    },
    {
      id: 'phc-nemmeli',
      name: 'Nemmeli PHC',
      code: 'PHC-NML-03',
      block: 'Thiruporur Block',
      district: 'Chengalpattu',
      latitude: 12.6938,
      longitude: 80.2079,
      population_served: 29000,
      phone: '+91 94431 22003',
      cold_chain_equipped: 1,
      contact_person: 'Dr. P. Anand, MO',
      address: 'East Coast Road, Nemmeli, Chengalpattu - 603104'
    },
    {
      id: 'phc-kovalam',
      name: 'Kovalam Coastal PHC',
      code: 'PHC-KVL-04',
      block: 'Thiruporur Block',
      district: 'Chengalpattu',
      latitude: 12.7936,
      longitude: 80.2514,
      population_served: 33000,
      phone: '+91 94431 22004',
      cold_chain_equipped: 1,
      contact_person: 'Dr. R. Meena, MO',
      address: 'Near Fishermen Colony, Kovalam, Chengalpattu - 603112'
    },
    {
      id: 'phc-alathur',
      name: 'Alathur PHC',
      code: 'PHC-ALT-05',
      block: 'Thiruporur Block',
      district: 'Chengalpattu',
      latitude: 12.6653,
      longitude: 80.1481,
      population_served: 26000,
      phone: '+91 94431 22005',
      cold_chain_equipped: 1,
      contact_person: 'Dr. T. Rajesh, MO',
      address: 'Alathur Village, Chengalpattu - 603110'
    },

    // Madurantakam Block
    {
      id: 'phc-madurantakam',
      name: 'Madurantakam Community Health Centre',
      code: 'PHC-MDK-06',
      block: 'Madurantakam Block',
      district: 'Chengalpattu',
      latitude: 12.5117,
      longitude: 79.8858,
      population_served: 62000,
      phone: '+91 94431 22006',
      cold_chain_equipped: 1,
      contact_person: 'Dr. G. Selvam, MO',
      address: 'Hospital Road, Madurantakam, Chengalpattu - 603306'
    },
    {
      id: 'phc-acharpakkam',
      name: 'Acharapakkam Upgraded PHC',
      code: 'PHC-ACP-07',
      block: 'Madurantakam Block',
      district: 'Chengalpattu',
      latitude: 12.4172,
      longitude: 79.8169,
      population_served: 38000,
      phone: '+91 94431 22007',
      cold_chain_equipped: 1,
      contact_person: 'Dr. D. Prema, MO',
      address: 'GST Road, Acharapakkam, Chengalpattu - 603301'
    },
    {
      id: 'phc-karunguzhi',
      name: 'Karunguzhi PHC',
      code: 'PHC-KRZ-08',
      block: 'Madurantakam Block',
      district: 'Chengalpattu',
      latitude: 12.5447,
      longitude: 79.9074,
      population_served: 31000,
      phone: '+91 94431 22008',
      cold_chain_equipped: 1,
      contact_person: 'Dr. S. Ramesh, MO',
      address: 'Bazaar Street, Karunguzhi, Chengalpattu - 603303'
    },
    {
      id: 'phc-chunampet',
      name: 'Chunampet PHC',
      code: 'PHC-CNP-09',
      block: 'Madurantakam Block',
      district: 'Chengalpattu',
      latitude: 12.3582,
      longitude: 79.9431,
      population_served: 27000,
      phone: '+91 94431 22009',
      cold_chain_equipped: 1,
      contact_person: 'Dr. V. Deepa, MO',
      address: 'Cheyyur Road, Chunampet, Chengalpattu - 603401'
    },
    {
      id: 'phc-perumbair',
      name: 'Perumbairkandigai PHC',
      code: 'PHC-PBK-10',
      block: 'Madurantakam Block',
      district: 'Chengalpattu',
      latitude: 12.4691,
      longitude: 79.7912,
      population_served: 24000,
      phone: '+91 94431 22010',
      cold_chain_equipped: 1,
      contact_person: 'Dr. K. Surya, MO',
      address: 'Perumbair Village, Chengalpattu - 603311'
    },

    // St. Thomas Mount / Kundrathur Block
    {
      id: 'phc-nandivaram',
      name: 'Nandivaram-Guduvancheri PHC',
      code: 'PHC-NDV-11',
      block: 'St. Thomas Mount Block',
      district: 'Chengalpattu',
      latitude: 12.8624,
      longitude: 80.0611,
      population_served: 72000,
      phone: '+91 94431 22011',
      cold_chain_equipped: 1,
      contact_person: 'Dr. B. Saravanan, MO',
      address: 'GST Road, Nandivaram, Guduvancheri - 603202'
    },
    {
      id: 'phc-kundrathur',
      name: 'Kundrathur Upgraded PHC',
      code: 'PHC-KND-12',
      block: 'St. Thomas Mount Block',
      district: 'Chengalpattu',
      latitude: 12.9723,
      longitude: 80.0984,
      population_served: 68000,
      phone: '+91 94431 22012',
      cold_chain_equipped: 1,
      contact_person: 'Dr. J. Nithya, MO',
      address: 'Murugan Temple Road, Kundrathur - 600069'
    },
    {
      id: 'phc-medavakkam',
      name: 'Medavakkam PHC',
      code: 'PHC-MDV-13',
      block: 'St. Thomas Mount Block',
      district: 'Chengalpattu',
      latitude: 12.9189,
      longitude: 80.1912,
      population_served: 61000,
      phone: '+91 94431 22013',
      cold_chain_equipped: 1,
      contact_person: 'Dr. A. Karthik, MO',
      address: 'Tambaram-Velachery Main Road, Medavakkam - 600100'
    },
    {
      id: 'phc-peerkankaranai',
      name: 'Peerkankaranai PHC',
      code: 'PHC-PKR-14',
      block: 'St. Thomas Mount Block',
      district: 'Chengalpattu',
      latitude: 12.9056,
      longitude: 80.0882,
      population_served: 45000,
      phone: '+91 94431 22014',
      cold_chain_equipped: 1,
      contact_person: 'Dr. H. Radhika, MO',
      address: 'Perungalathur West, Peerkankaranai - 600063'
    },
    {
      id: 'phc-polichalur',
      name: 'Polichalur PHC',
      code: 'PHC-PCL-15',
      block: 'St. Thomas Mount Block',
      district: 'Chengalpattu',
      latitude: 12.9774,
      longitude: 80.1415,
      population_served: 39000,
      phone: '+91 94431 22015',
      cold_chain_equipped: 1,
      contact_person: 'Dr. E. Dinesh, MO',
      address: 'Bhavani Nagar, Polichalur - 600074'
    }
  ];

  const insertPhc = db.prepare(`
    INSERT INTO phcs (id, name, code, block, district, latitude, longitude, population_served, phone, cold_chain_equipped, contact_person, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  phcs.forEach(p => {
    insertPhc.run(p.id, p.name, p.code, p.block, p.district, p.latitude, p.longitude, p.population_served, p.phone, p.cold_chain_equipped, p.contact_person, p.address);
  });
  console.log(`✅ Seeded ${phcs.length} PHCs across 3 blocks.`);

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
      critical_flag: 0,
      standard_buffer_days: 30,
      critical_buffer_days: 15,
      seasonal_disease: 'General Fevers, Monsoon Outbreaks',
      description: 'Standard antipyretic and analgesic for adults and teenagers'
    },
    {
      id: 'med-ors',
      name: 'Oral Rehydration Salts (ORS) WHO Formula',
      generic_name: 'Sodium Chloride + Potassium Chloride + Dextrose',
      category: 'Maternal & Child Health',
      form: 'Sachet',
      strength: '20.5g',
      unit: 'Sachets',
      cold_chain_flag: 0,
      critical_flag: 1,
      standard_buffer_days: 35,
      critical_buffer_days: 25,
      seasonal_disease: 'Summer Diarrhea Outbreaks, Cholera Surveillance',
      description: 'Essential fluid and electrolyte replenishment in acute diarrheal diseases'
    },
    {
      id: 'med-amox-syp',
      name: 'Amoxicillin Oral Suspension',
      generic_name: 'Amoxicillin Trihydrate',
      category: 'Antibiotics',
      form: 'Dry Powder for Suspension',
      strength: '125mg/5ml',
      unit: 'Bottles (60ml)',
      cold_chain_flag: 0,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 20,
      seasonal_disease: 'Monsoon Respiratory Tract Infections (RTI)',
      description: 'First-line pediatric antibiotic for bacterial otitis, pharyngitis, RTI'
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
      seasonal_disease: 'Respiratory Infections',
      description: 'Broad-spectrum beta-lactam antibacterial for adult infections'
    },
    {
      id: 'med-ifa-tab',
      name: 'Iron and Folic Acid Tablets (IFA Large)',
      generic_name: 'Ferrous Sulphate 100mg + Folic Acid 0.5mg',
      category: 'Maternal & Child Health',
      form: 'Coated Tablet',
      strength: '100mg Elemental Fe + 0.5mg FA',
      unit: 'Tablets',
      cold_chain_flag: 0,
      critical_flag: 1,
      standard_buffer_days: 45,
      critical_buffer_days: 30,
      seasonal_disease: 'Year-round Maternal Anaemia Control',
      description: 'National Anemia Mukt Bharat program mandatory distribution for pregnant mothers'
    },
    {
      id: 'med-ifa-syp',
      name: 'Iron and Folic Acid Syrup',
      generic_name: 'Ferrous Fumarate + Folic Acid',
      category: 'Maternal & Child Health',
      form: 'Syrup',
      strength: '20mg Fe + 100mcg FA / ml',
      unit: 'Bottles (50ml)',
      cold_chain_flag: 0,
      critical_flag: 0,
      standard_buffer_days: 35,
      critical_buffer_days: 20,
      seasonal_disease: 'Pediatric Anemia Prevention',
      description: 'Liquid iron formulation with auto-dispenser dropper for infants and young children'
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
      standard_buffer_days: 30,
      critical_buffer_days: 20,
      seasonal_disease: 'Makkalai Thedi Maruthuvam (MTM) Chronic Delivery',
      description: 'First-line oral biguanide anti-hyperglycemic agent for Type 2 Diabetes'
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
      seasonal_disease: 'Chronic NCD Care',
      description: 'Sulfonylurea oral hypoglycemic agent'
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
      standard_buffer_days: 30,
      critical_buffer_days: 20,
      seasonal_disease: 'Hypertension Management',
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
      seasonal_disease: 'Hypertension & Heart Failure',
      description: 'ACE inhibitor for cardiac and renovascular hypertension'
    },
    {
      id: 'med-insulin-reg',
      name: 'Human Regular Soluble Insulin Injection',
      generic_name: 'Recombinant Human Regular Insulin',
      category: 'Cold-Chain Biologicals',
      form: 'Vial (10ml)',
      strength: '40 IU/ml',
      unit: 'Vials',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 25,
      critical_buffer_days: 18,
      seasonal_disease: 'Acute Glycemic Crises',
      description: 'Short-acting insulin stored strictly at 2°C to 8°C (Cold-chain required)'
    },
    {
      id: 'med-insulin-nph',
      name: 'Isophane Insulin (NPH) Suspension',
      generic_name: 'Neutral Protamine Hagedorn Insulin',
      category: 'Cold-Chain Biologicals',
      form: 'Vial (10ml)',
      strength: '40 IU/ml',
      unit: 'Vials',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 25,
      critical_buffer_days: 18,
      seasonal_disease: 'Daily Basal Insulin Therapy',
      description: 'Intermediate-acting insulin stored strictly at 2°C to 8°C'
    },
    {
      id: 'med-asv',
      name: 'Anti-Snake Venom (ASV) Serum Polyvalent',
      generic_name: 'Lyophilized Polyvalent Anti-Snake Venom',
      category: 'Emergency & Antidotes',
      form: 'Vial (Lyophilized)',
      strength: '10ml reconstituted',
      unit: 'Vials',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 25,
      seasonal_disease: 'Monsoon Agricultural Snakebite Surges (Cobra, Viper, Krait)',
      description: 'Life-saving antidote for big four poisonous snakebites in rural Tamil Nadu'
    },
    {
      id: 'med-tt',
      name: 'Tetanus Toxoid Vaccine IP',
      generic_name: 'Tetanus Toxoid Adsorbed',
      category: 'Cold-Chain Biologicals',
      form: 'Ampoule (0.5ml)',
      strength: '5 LF / 0.5ml',
      unit: 'Ampoules',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 20,
      seasonal_disease: 'Trauma & Antenatal Immunization',
      description: 'Active immunization against tetanus, antenatal tetanus prophylaxis'
    },
    {
      id: 'med-pentavalent',
      name: 'Pentavalent Vaccine (DPT-HepB-Hib)',
      generic_name: 'Diphtheria, Pertussis, Tetanus, Hep B, Hib',
      category: 'Cold-Chain Biologicals',
      form: 'Vial (10 doses)',
      strength: '10 dose vial',
      unit: 'Vials',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 21,
      seasonal_disease: 'Universal Immunization Program (UIP)',
      description: 'Crucial 5-in-1 pediatric vaccine strictly kept between 2°C to 8°C'
    },
    {
      id: 'med-bopv',
      name: 'Bivalent Oral Polio Vaccine (bOPV)',
      generic_name: 'Type 1 and Type 3 Poliovirus',
      category: 'Cold-Chain Biologicals',
      form: 'Dropper Vial (20 doses)',
      strength: '20 doses / vial',
      unit: 'Vials',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 21,
      seasonal_disease: 'Routine Immunization & Pulse Polio',
      description: 'Stored in deep freeze (-20°C) or ILR ice-lined refrigerator with VVM monitoring'
    },
    {
      id: 'med-mr',
      name: 'Measles-Rubella (MR) Vaccine',
      generic_name: 'Live Attenuated Measles & Rubella Virus',
      category: 'Cold-Chain Biologicals',
      form: 'Vial with Diluent',
      strength: '5 dose vial',
      unit: 'Vials',
      cold_chain_flag: 1,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 20,
      seasonal_disease: 'Childhood Viral Outbreak Prevention',
      description: 'Reconstituted vaccine strictly used within 4 hours; mandatory cold chain'
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
      seasonal_disease: 'Seasonal Allergic Rhinitis, Insect Bites',
      description: 'Second-generation selective H1 receptor antagonist'
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
      seasonal_disease: 'Atypical Pneumonias, Skin Infections',
      description: 'Macrolide antibiotic for upper and lower respiratory tract infections'
    },
    {
      id: 'med-cipro-drops',
      name: 'Ciprofloxacin Ophthalmic / Otic Solution',
      generic_name: 'Ciprofloxacin HCl 0.3% w/v',
      category: 'Ophthalmic / Otic',
      form: 'Eye / Ear Drops',
      strength: '0.3% w/v (5ml)',
      unit: 'Bottles',
      cold_chain_flag: 0,
      critical_flag: 0,
      standard_buffer_days: 25,
      critical_buffer_days: 15,
      seasonal_disease: 'Conjunctivitis (Madras Eye) Post-Rain Epidemics',
      description: 'Antibiotic drops for bacterial conjunctivitis and otitis externa'
    },
    {
      id: 'med-salbutamol',
      name: 'Salbutamol Metered Dose Inhaler',
      generic_name: 'Salbutamol Sulfate',
      category: 'Respiratory',
      form: 'Inhaler Canister',
      strength: '100mcg / puff (200 doses)',
      unit: 'Inhalers',
      cold_chain_flag: 0,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 20,
      seasonal_disease: 'Winter / Monsoon Bronchospasm, Asthma Exacerbations',
      description: 'Fast-acting bronchodilator for acute wheezing and asthma'
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
      standard_buffer_days: 35,
      critical_buffer_days: 15,
      seasonal_disease: 'National Deworming Day Mass Distribution',
      description: 'Broad-spectrum anti-parasitic agent for soil-transmitted helminths'
    },
    {
      id: 'med-zinc',
      name: 'Zinc Sulphate Dispersible Tablets IP',
      generic_name: 'Zinc Sulphate',
      category: 'Maternal & Child Health',
      form: 'Dispersible Tablet',
      strength: '20mg',
      unit: 'Tablets',
      cold_chain_flag: 0,
      critical_flag: 0,
      standard_buffer_days: 30,
      critical_buffer_days: 15,
      seasonal_disease: 'Pediatric Diarrhea Adjunct Therapy',
      description: 'Mandatory co-prescription with ORS in under-5 childhood diarrhea'
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
      seasonal_disease: 'Severe Anaphylaxis, Acute Allergic Reactions',
      description: 'Potent systemic corticosteroid for acute medical emergencies'
    },
    {
      id: 'med-adrenaline',
      name: 'Adrenaline (Epinephrine) Injection IP',
      generic_name: 'Adrenaline Bitartrate',
      category: 'Emergency & Antidotes',
      form: 'Ampoule (1ml)',
      strength: '1:1000 (1mg/ml)',
      unit: 'Ampoules',
      cold_chain_flag: 0,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 25,
      seasonal_disease: 'Anaphylactic Shock, Severe Bronchospasm',
      description: 'Emergency resuscitation hormone; primary antidote for acute vaccine anaphylaxis'
    },
    {
      id: 'med-atropine',
      name: 'Atropine Sulphate Injection IP',
      generic_name: 'Atropine Sulphate',
      category: 'Emergency & Antidotes',
      form: 'Ampoule (1ml)',
      strength: '0.6mg/ml',
      unit: 'Ampoules',
      cold_chain_flag: 0,
      critical_flag: 1,
      standard_buffer_days: 30,
      critical_buffer_days: 25,
      seasonal_disease: 'Agricultural Organophosphate Pesticide Poisoning',
      description: 'Life-saving antidote for rural pesticide ingestion and severe bradycardia'
    },
    {
      id: 'med-calcium-d3',
      name: 'Calcium and Vitamin D3 Tablets',
      generic_name: 'Calcium Carbonate 500mg + Vit D3 250 IU',
      category: 'Supplements',
      form: 'Tablet',
      strength: '500mg Ca + 250 IU D3',
      unit: 'Tablets',
      cold_chain_flag: 0,
      critical_flag: 0,
      standard_buffer_days: 35,
      critical_buffer_days: 15,
      seasonal_disease: 'Antenatal & Geriatric Bone Health',
      description: 'Daily nutritional supplement for lactating mothers and elderly'
    },
    {
      id: 'med-pantoprazole',
      name: 'Pantoprazole Gastro-Resistant Tablets IP',
      generic_name: 'Pantoprazole Sodium',
      category: 'Gastrointestinal',
      form: 'Tablet',
      strength: '40mg',
      unit: 'Tablets',
      cold_chain_flag: 0,
      critical_flag: 0,
      standard_buffer_days: 30,
      critical_buffer_days: 15,
      seasonal_disease: 'Acid Peptic Disorder, NSAID Co-prescriptions',
      description: 'Proton pump inhibitor for gastro-esophageal reflux and ulceration'
    },
    {
      id: 'med-povidone',
      name: 'Povidone-Iodine Solution IP 5% w/v',
      generic_name: 'Povidone-Iodine',
      category: 'Surgical & Antiseptics',
      form: 'Topical Solution',
      strength: '5% w/v (500ml)',
      unit: 'Bottles',
      cold_chain_flag: 0,
      critical_flag: 0,
      standard_buffer_days: 30,
      critical_buffer_days: 15,
      seasonal_disease: 'Wound Dressing & Trauma Care',
      description: 'Antiseptic microbicidal solution for rural trauma and minor surgical procedures'
    }
  ];

  const insertMed = db.prepare(`
    INSERT INTO medicines (id, name, generic_name, category, form, strength, unit, cold_chain_flag, critical_flag, standard_buffer_days, critical_buffer_days, seasonal_disease, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  medicines.forEach(m => {
    insertMed.run(m.id, m.name, m.generic_name, m.category, m.form, m.strength, m.unit, m.cold_chain_flag, m.critical_flag, m.standard_buffer_days, m.critical_buffer_days, m.seasonal_disease, m.description);
  });
  console.log(`✅ Seeded ${medicines.length} essential medicines with clinical specifications.`);

  // 4. Generate 90 Days of Stock History and Realistic Scenarios
  // Let's create realistic stock dynamics:
  // - Thiruporur PHC ran out of Paracetamol Pediatric Syrup!
  // - Kelambakkam Upgraded PHC has high surplus of Paracetamol Syrup and Amoxicillin!
  // - Nemmeli PHC has low Anti-Snake Venom (ASV), while Thiruporur has surplus!
  // - Alathur PHC has low Amoxicillin Suspension, while Kelambakkam has surplus!
  
  const insertStockEntry = db.prepare(`
    INSERT INTO stock_entries (id, phc_id, medicine_id, entry_date, opening_stock, received_quantity, dispensed_quantity, closing_stock, batch_number, expiry_date, created_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCurrentStock = db.prepare(`
    INSERT INTO current_stock (id, phc_id, medicine_id, quantity, batch_number, expiry_date, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertBatch = db.prepare(`
    INSERT INTO batches (id, medicine_id, batch_number, expiry_date, manufacturer)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Create sample batches
  const batches = [
    { id: 'b-pcm-01', medicine_id: 'med-pcm-syp', batch_number: 'TNMSC-PCM-24A', expiry_date: '2027-08-31', manufacturer: 'Tamil Nadu Medical Services Corp' },
    { id: 'b-pcm-02', medicine_id: 'med-pcm-syp', batch_number: 'TNMSC-PCM-23K', expiry_date: '2026-11-15', manufacturer: 'TNMSC' }, // Near expiry!
    { id: 'b-ors-01', medicine_id: 'med-ors', batch_number: 'TNMSC-ORS-881', expiry_date: '2028-01-31', manufacturer: 'CIPLA Health' },
    { id: 'b-asv-01', medicine_id: 'med-asv', batch_number: 'KBS-ASV-2024-09', expiry_date: '2027-04-30', manufacturer: 'King Institute Guindy' },
    { id: 'b-ins-01', medicine_id: 'med-insulin-reg', batch_number: 'BOC-INS-7721', expiry_date: '2027-02-28', manufacturer: 'Biocon Biologics' },
    { id: 'b-amx-01', medicine_id: 'med-amox-syp', batch_number: 'ALM-AMX-901', expiry_date: '2027-06-30', manufacturer: 'Alkem Labs' }
  ];

  batches.forEach(b => {
    insertBatch.run(b.id, b.medicine_id, b.batch_number, b.expiry_date, b.manufacturer);
  });

  const today = new Date();

  // Helper date formatter YYYY-MM-DD
  const formatDate = (d) => {
    return d.toISOString().split('T')[0];
  };

  let entryCount = 0;

  // We will generate 90-day time-series history for all PHCs and key medicines
  phcs.forEach(phc => {
    medicines.forEach(med => {
      // Base average daily consumption tuned to population
      const popFactor = phc.population_served / 40000;
      let baseDailyUsage = 0;

      if (med.id === 'med-pcm-syp') baseDailyUsage = Math.round(14 * popFactor);
      else if (med.id === 'med-pcm-500') baseDailyUsage = Math.round(85 * popFactor);
      else if (med.id === 'med-ors') baseDailyUsage = Math.round(25 * popFactor);
      else if (med.id === 'med-amox-syp') baseDailyUsage = Math.round(10 * popFactor);
      else if (med.id === 'med-ifa-tab') baseDailyUsage = Math.round(50 * popFactor);
      else if (med.id === 'med-metformin') baseDailyUsage = Math.round(65 * popFactor);
      else if (med.id === 'med-amlodipine') baseDailyUsage = Math.round(60 * popFactor);
      else if (med.id === 'med-asv') baseDailyUsage = 0.5 * popFactor; // rare emergency
      else if (med.id === 'med-insulin-reg') baseDailyUsage = Math.round(3 * popFactor);
      else baseDailyUsage = Math.max(1, Math.round(8 * popFactor));

      // Current stock scenario target
      let currentQty = 0;
      let isStockoutScenario = false;
      let isSurplusScenario = false;

      // SPECIFIC TARGETED SCENARIO:
      // Thiruporur PHC running out of Paracetamol Syrup
      if (phc.id === 'phc-thiruporur' && med.id === 'med-pcm-syp') {
        currentQty = 8; // Only 8 bottles left! (~0.5 days)
        isStockoutScenario = true;
      }
      // Kelambakkam PHC has surplus of Paracetamol Syrup
      else if (phc.id === 'phc-kelambakkam' && med.id === 'med-pcm-syp') {
        currentQty = 1200; // 1,200 bottles! (43 days of stock, healthy surplus)
        isSurplusScenario = true;
      }
      // Nemmeli PHC low on ASV
      else if (phc.id === 'phc-nemmeli' && med.id === 'med-asv') {
        currentQty = 2; // Critical low!
        isStockoutScenario = true;
      }
      // Thiruporur PHC has surplus ASV
      else if (phc.id === 'phc-thiruporur' && med.id === 'med-asv') {
        currentQty = 35; // Healthy stock (35+ days buffer)
        isSurplusScenario = true;
      }
      // Alathur PHC low on Amoxicillin Syrup
      else if (phc.id === 'phc-alathur' && med.id === 'med-amox-syp') {
        currentQty = 9; // ~1 day left
        isStockoutScenario = true;
      }
      // Kelambakkam PHC has surplus Amoxicillin Syrup
      else if (phc.id === 'phc-kelambakkam' && med.id === 'med-amox-syp') {
        currentQty = 650; // Surplus (40+ days)
        isSurplusScenario = true;
      }
      // Kovalam PHC low on ORS
      else if (phc.id === 'phc-kovalam' && med.id === 'med-ors') {
        currentQty = 35; // Red alert
        isStockoutScenario = true;
      }
      // Madurantakam has surplus ORS
      else if (phc.id === 'phc-madurantakam' && med.id === 'med-ors') {
        currentQty = 1500;
        isSurplusScenario = true;
      }
      else {
        // Normal distribution: around 20 to 45 days of stock
        const randomDays = 15 + Math.floor(Math.random() * 30);
        currentQty = Math.max(15, Math.round(baseDailyUsage * randomDays));
      }

      // Generate 90 daily entries walking backwards from today
      let runningStock = currentQty;
      const batchNum = `TN-${med.id.replace('med-', '').toUpperCase()}-${2025 + (Math.random() > 0.5 ? 1 : 2)}`;
      const expDate = isStockoutScenario ? '2026-11-20' : '2027-10-31';

      // Insert Current Stock record
      insertCurrentStock.run(
        `cs-${phc.id}-${med.id}`,
        phc.id,
        med.id,
        currentQty,
        batchNum,
        expDate
      );

      // Walk back 90 days for time-series stock history
      for (let dayOffset = 0; dayOffset < 90; dayOffset++) {
        const entryDateObj = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
        const entryDateStr = formatDate(entryDateObj);

        // Daily variability with seasonal monsoon uptick in October-December
        const month = entryDateObj.getMonth() + 1; // 10, 11, 12 is monsoon season in TN
        const isMonsoon = (month >= 10 && month <= 12);
        const seasonalMultiplier = (isMonsoon && (med.id.includes('pcm') || med.id.includes('amox') || med.id.includes('asv'))) ? 1.45 : 1.0;

        const noise = 0.8 + Math.random() * 0.4;
        let dispensed = Math.max(0, Math.round(baseDailyUsage * seasonalMultiplier * noise));
        if (dispensed > runningStock && dayOffset === 0) dispensed = Math.min(runningStock, dispensed);

        // Monthly replenishment batch (e.g. at day 30 and day 60)
        let received = 0;
        if ((dayOffset === 30 || dayOffset === 60) && !isStockoutScenario) {
          received = Math.round(baseDailyUsage * 30);
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
        // Step back runningStock for the previous day
        runningStock = opening;
      }
    });
  });

  console.log(`✅ Seeded ${entryCount} stock history records across 90 days.`);

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

  // 8. Seed Notification Dispatches (Mock SMS / WhatsApp)
  const notifications = [
    {
      id: 'notif-001',
      recipient_phone: '+91 94431 22001',
      channel: 'sms',
      alert_id: 'alt-001',
      message: '[MediSync Alert] Thiruporur PHC: Paracetamol Syrup stock critical (8 bottles left). Immediate transfer recommended from Kelambakkam PHC (460 bottles, 7.8 km).'
    },
    {
      id: 'notif-002',
      recipient_phone: '+91 98401 11005',
      channel: 'whatsapp',
      alert_id: 'alt-001',
      message: '🏥 MediSync PHC Block Update: Alert triggered for Thiruporur PHC. 1 shortage matched with Kelambakkam surplus. Tap to approve transfer: https://medisync.tn.gov.in/transfers/trf-001'
    }
  ];

  const insertNotif = db.prepare(`
    INSERT INTO notification_dispatches (id, recipient_phone, channel, alert_id, message)
    VALUES (?, ?, ?, ?, ?)
  `);

  notifications.forEach(n => {
    insertNotif.run(n.id, n.recipient_phone, n.channel, n.alert_id, n.message);
  });

  // 9. Seed Audit Logs
  const auditLogs = [
    {
      id: 'aud-001',
      user_id: 'usr-pharm-tpr',
      action: 'STOCK_ENTRY',
      entity_type: 'stock_entries',
      entity_id: 'se-phc-thiruporur-med-pcm-syp',
      details: 'Recorded daily stock count: Opening 24, Dispensed 16, Closing 8 bottles.',
      ip_address: '10.24.11.45'
    },
    {
      id: 'aud-002',
      user_id: 'usr-pharm-tpr',
      action: 'TRANSFER_REQUEST',
      entity_type: 'transfer_requests',
      entity_id: 'trf-001',
      details: 'Initiated emergency transfer request TRF-TN-2026-0081 for 120 bottles of Paracetamol Syrup from Kelambakkam PHC.',
      ip_address: '10.24.11.45'
    }
  ];

  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  auditLogs.forEach(a => {
    insertAudit.run(a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address);
  });

    console.log('🎉 Seeding successfully completed for MediSync PHC!');
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
