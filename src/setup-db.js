const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const fs = require('fs');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'lis.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'technician',
    email TEXT,
    active INTEGER DEFAULT 1,
    force_password_change INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Patients table
  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    gender TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    insurance_provider TEXT,
    insurance_number TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Test catalog
  CREATE TABLE IF NOT EXISTS test_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    sample_type TEXT NOT NULL,
    unit TEXT,
    reference_range_min REAL,
    reference_range_max REAL,
    reference_range_text TEXT,
    price REAL NOT NULL DEFAULT 0,
    turnaround_hours INTEGER DEFAULT 24,
    active INTEGER DEFAULT 1
  );

  -- Lab orders
  CREATE TABLE IF NOT EXISTS lab_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    ordering_physician TEXT,
    clinical_notes TEXT,
    priority TEXT DEFAULT 'routine',
    status TEXT DEFAULT 'pending',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Samples
  CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id TEXT UNIQUE NOT NULL,
    order_id INTEGER NOT NULL,
    sample_type TEXT NOT NULL,
    collection_date TEXT DEFAULT (datetime('now')),
    collected_by INTEGER,
    status TEXT DEFAULT 'collected',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES lab_orders(id),
    FOREIGN KEY (collected_by) REFERENCES users(id)
  );

  -- Test results
  CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    result_value TEXT,
    result_numeric REAL,
    unit TEXT,
    reference_range TEXT,
    flag TEXT,
    status TEXT DEFAULT 'pending',
    performed_by INTEGER,
    verified_by INTEGER,
    performed_at TEXT,
    verified_at TEXT,
    notes TEXT,
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (test_id) REFERENCES test_catalog(id),
    FOREIGN KEY (order_id) REFERENCES lab_orders(id),
    FOREIGN KEY (performed_by) REFERENCES users(id),
    FOREIGN KEY (verified_by) REFERENCES users(id)
  );

  -- Invoices
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    order_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'unpaid',
    payment_method TEXT,
    paid_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES lab_orders(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  );

  -- Invoice line items
  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (test_id) REFERENCES test_catalog(id)
  );

  -- Audit trail
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Notification settings
  CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    smtp_host TEXT DEFAULT '',
    smtp_port INTEGER DEFAULT 587,
    smtp_user TEXT DEFAULT '',
    smtp_pass TEXT DEFAULT '',
    smtp_from TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0
  );

  -- Test panels (groups of tests)
  CREATE TABLE IF NOT EXISTS test_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL,
    active INTEGER DEFAULT 1
  );

  -- Panel-test mapping
  CREATE TABLE IF NOT EXISTS panel_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    FOREIGN KEY (panel_id) REFERENCES test_panels(id),
    FOREIGN KEY (test_id) REFERENCES test_catalog(id),
    UNIQUE(panel_id, test_id)
  );

  -- Critical value thresholds
  CREATE TABLE IF NOT EXISTS critical_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL,
    critical_low REAL,
    critical_high REAL,
    action_required TEXT DEFAULT 'Notify physician immediately',
    FOREIGN KEY (test_id) REFERENCES test_catalog(id)
  );

  -- Critical value alerts
  CREATE TABLE IF NOT EXISTS critical_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    test_name TEXT NOT NULL,
    result_value TEXT NOT NULL,
    critical_type TEXT NOT NULL,
    acknowledged INTEGER DEFAULT 0,
    acknowledged_by INTEGER,
    acknowledged_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (result_id) REFERENCES test_results(id),
    FOREIGN KEY (order_id) REFERENCES lab_orders(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  );

  -- Result amendments
  CREATE TABLE IF NOT EXISTS result_amendments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL,
    previous_value TEXT,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    amended_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (result_id) REFERENCES test_results(id),
    FOREIGN KEY (amended_by) REFERENCES users(id)
  );

  -- Referring physicians
  CREATE TABLE IF NOT EXISTS physicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    specialty TEXT,
    clinic TEXT,
    phone TEXT,
    email TEXT,
    license_number TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- In-app notifications
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- MRI Studies
  CREATE TABLE IF NOT EXISTS mri_studies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    ordering_physician TEXT,
    body_part TEXT NOT NULL,
    modality TEXT NOT NULL DEFAULT 'MRI',
    contrast TEXT DEFAULT 'without',
    clinical_indication TEXT,
    priority TEXT DEFAULT 'routine',
    status TEXT DEFAULT 'scheduled',
    scheduled_date TEXT,
    performed_date TEXT,
    performed_by INTEGER,
    scanner TEXT,
    notes TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (performed_by) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- MRI Images (references to image files/thumbnails)
  CREATE TABLE IF NOT EXISTS mri_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id INTEGER NOT NULL,
    series_number INTEGER DEFAULT 1,
    series_description TEXT,
    image_number INTEGER DEFAULT 1,
    filename TEXT NOT NULL,
    thumbnail TEXT,
    slice_thickness TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES mri_studies(id)
  );

  -- MRI Reports (radiology reports)
  CREATE TABLE IF NOT EXISTS mri_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id INTEGER NOT NULL,
    report_status TEXT DEFAULT 'draft',
    findings TEXT,
    impression TEXT,
    technique TEXT,
    comparison TEXT,
    recommendations TEXT,
    radiologist TEXT,
    reported_by INTEGER,
    reported_at TEXT,
    verified_by INTEGER,
    verified_at TEXT,
    addendum TEXT,
    addendum_by INTEGER,
    addendum_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (study_id) REFERENCES mri_studies(id),
    FOREIGN KEY (reported_by) REFERENCES users(id),
    FOREIGN KEY (verified_by) REFERENCES users(id)
  );
`);

// Seed default admin user (force_password_change = 1 so admin must change password on first login)
const hashedPassword = bcrypt.hashSync('admin123', 10);
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, full_name, role, email, force_password_change)
  VALUES (?, ?, ?, ?, ?, ?)
`);
insertUser.run('admin', hashedPassword, 'System Administrator', 'admin', 'admin@lab.com', 1);

// Seed test catalog
const insertTest = db.prepare(`
  INSERT OR IGNORE INTO test_catalog (code, name, category, description, sample_type, unit, reference_range_min, reference_range_max, reference_range_text, price, turnaround_hours)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const tests = [
  // Hematology
  ['CBC', 'Complete Blood Count', 'Hematology', 'Full blood count with differential', 'Blood (EDTA)', null, null, null, 'See individual components', 25.00, 4],
  ['WBC', 'White Blood Cell Count', 'Hematology', 'Total white blood cell count', 'Blood (EDTA)', 'x10³/µL', 4.5, 11.0, '4.5-11.0 x10³/µL', 10.00, 4],
  ['RBC', 'Red Blood Cell Count', 'Hematology', 'Total red blood cell count', 'Blood (EDTA)', 'x10⁶/µL', 4.5, 5.5, '4.5-5.5 x10⁶/µL', 10.00, 4],
  ['HGB', 'Hemoglobin', 'Hematology', 'Hemoglobin concentration', 'Blood (EDTA)', 'g/dL', 12.0, 17.5, '12.0-17.5 g/dL', 10.00, 4],
  ['HCT', 'Hematocrit', 'Hematology', 'Packed cell volume', 'Blood (EDTA)', '%', 36.0, 50.0, '36-50%', 10.00, 4],
  ['PLT', 'Platelet Count', 'Hematology', 'Thrombocyte count', 'Blood (EDTA)', 'x10³/µL', 150, 400, '150-400 x10³/µL', 10.00, 4],
  ['ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 'ESR Westergren method', 'Blood (EDTA)', 'mm/hr', 0, 20, '0-20 mm/hr', 8.00, 2],

  // Chemistry
  ['GLU', 'Glucose (Fasting)', 'Chemistry', 'Fasting blood glucose', 'Blood (Serum)', 'mg/dL', 70, 100, '70-100 mg/dL', 12.00, 4],
  ['BUN', 'Blood Urea Nitrogen', 'Chemistry', 'BUN level', 'Blood (Serum)', 'mg/dL', 7, 20, '7-20 mg/dL', 12.00, 4],
  ['CREAT', 'Creatinine', 'Chemistry', 'Serum creatinine', 'Blood (Serum)', 'mg/dL', 0.7, 1.3, '0.7-1.3 mg/dL', 12.00, 4],
  ['ALT', 'Alanine Aminotransferase', 'Chemistry', 'SGPT liver enzyme', 'Blood (Serum)', 'U/L', 7, 56, '7-56 U/L', 15.00, 6],
  ['AST', 'Aspartate Aminotransferase', 'Chemistry', 'SGOT liver enzyme', 'Blood (Serum)', 'U/L', 10, 40, '10-40 U/L', 15.00, 6],
  ['CHOL', 'Total Cholesterol', 'Chemistry', 'Total cholesterol level', 'Blood (Serum)', 'mg/dL', 0, 200, '<200 mg/dL desirable', 15.00, 6],
  ['TRIG', 'Triglycerides', 'Chemistry', 'Triglyceride level', 'Blood (Serum)', 'mg/dL', 0, 150, '<150 mg/dL normal', 15.00, 6],
  ['UA', 'Uric Acid', 'Chemistry', 'Serum uric acid', 'Blood (Serum)', 'mg/dL', 3.4, 7.0, '3.4-7.0 mg/dL', 12.00, 4],

  // Urinalysis
  ['URINE', 'Urinalysis Complete', 'Urinalysis', 'Complete urine analysis', 'Urine', null, null, null, 'See individual components', 15.00, 4],
  ['URINE-CS', 'Urine Culture & Sensitivity', 'Urinalysis', 'Urine culture with antibiotic sensitivity', 'Urine', null, null, null, 'No growth / organism identified', 35.00, 48],

  // Immunology
  ['CRP', 'C-Reactive Protein', 'Immunology', 'Inflammation marker', 'Blood (Serum)', 'mg/L', 0, 10, '<10 mg/L normal', 20.00, 6],
  ['TSH', 'Thyroid Stimulating Hormone', 'Immunology', 'Thyroid function test', 'Blood (Serum)', 'mIU/L', 0.4, 4.0, '0.4-4.0 mIU/L', 25.00, 8],
  ['HBA1C', 'Hemoglobin A1c', 'Immunology', 'Glycated hemoglobin - diabetes marker', 'Blood (EDTA)', '%', 4.0, 5.6, '<5.7% normal', 30.00, 8],

  // Genetics
  ['BRCA', 'BRCA1/BRCA2 Gene Panel', 'Genetics', 'Breast/ovarian cancer risk gene analysis', 'Blood (EDTA)', null, null, null, 'Positive/Negative for pathogenic variants', 350.00, 336],
  ['KARYO', 'Karyotype Analysis', 'Genetics', 'Chromosome analysis for structural abnormalities', 'Blood (EDTA)', null, null, null, '46,XX or 46,XY normal', 250.00, 504],
  ['CF-GENE', 'Cystic Fibrosis Gene Panel', 'Genetics', 'CFTR gene mutation screening', 'Blood (EDTA)', null, null, null, 'Carrier/Non-carrier', 200.00, 336],
  ['SCD', 'Sickle Cell Gene Test', 'Genetics', 'HBB gene analysis for sickle cell variants', 'Blood (EDTA)', null, null, null, 'HbAA normal / HbAS carrier / HbSS disease', 120.00, 168],
  ['THAL', 'Thalassemia Gene Panel', 'Genetics', 'Alpha and beta thalassemia gene analysis', 'Blood (EDTA)', null, null, null, 'Normal/Carrier/Affected', 180.00, 336],
  ['PHAR', 'Pharmacogenomics Panel', 'Genetics', 'Drug metabolism gene variants (CYP450, DPYD, etc.)', 'Blood (EDTA)', null, null, null, 'See individual gene results', 300.00, 336],
  ['NIPT', 'Non-Invasive Prenatal Testing', 'Genetics', 'Cell-free DNA screening for trisomy 13, 18, 21', 'Blood (EDTA)', null, null, null, 'Low risk / High risk', 400.00, 168],
  ['FH-GENE', 'Familial Hypercholesterolemia Panel', 'Genetics', 'LDLR, APOB, PCSK9 gene analysis', 'Blood (EDTA)', null, null, null, 'Positive/Negative for pathogenic variants', 280.00, 336],
  ['LYNCH', 'Lynch Syndrome Panel', 'Genetics', 'MLH1, MSH2, MSH6, PMS2 gene analysis', 'Genetics', null, null, null, 'Positive/Negative for pathogenic variants', 320.00, 336],
  ['WES', 'Whole Exome Sequencing', 'Genetics', 'Comprehensive exome analysis for rare genetic disorders', 'Blood (EDTA)', null, null, null, 'See detailed report', 800.00, 672],
];

const insertTests = db.transaction(() => {
  for (const test of tests) {
    insertTest.run(...test);
  }
});
insertTests();

// Seed test panels
const insertPanel = db.prepare('INSERT OR IGNORE INTO test_panels (code, name, description, price) VALUES (?, ?, ?, ?)');
const insertPanelTest = db.prepare('INSERT OR IGNORE INTO panel_tests (panel_id, test_id) VALUES (?, ?)');
const getTestByCode = db.prepare('SELECT id FROM test_catalog WHERE code = ?');

const panels = [
  { code: 'LIVER', name: 'Liver Panel', desc: 'ALT, AST, Bilirubin', price: 25.00, tests: ['ALT', 'AST'] },
  { code: 'LIPID', name: 'Lipid Panel', desc: 'Total cholesterol, triglycerides', price: 25.00, tests: ['CHOL', 'TRIG'] },
  { code: 'RENAL', name: 'Renal Panel', desc: 'BUN, creatinine, uric acid', price: 30.00, tests: ['BUN', 'CREAT', 'UA'] },
  { code: 'DIAB', name: 'Diabetes Panel', desc: 'Fasting glucose, HbA1c', price: 35.00, tests: ['GLU', 'HBA1C'] },
  { code: 'THYROID', name: 'Thyroid Panel', desc: 'TSH', price: 25.00, tests: ['TSH'] },
  { code: 'CBC-FULL', name: 'CBC Full Panel', desc: 'WBC, RBC, Hemoglobin, Hematocrit, Platelets', price: 35.00, tests: ['WBC', 'RBC', 'HGB', 'HCT', 'PLT'] },
  { code: 'INFLAM', name: 'Inflammation Panel', desc: 'CRP, ESR', price: 25.00, tests: ['CRP', 'ESR'] },
];

const seedPanels = db.transaction(() => {
  for (const panel of panels) {
    insertPanel.run(panel.code, panel.name, panel.desc, panel.price);
    const p = db.prepare('SELECT id FROM test_panels WHERE code = ?').get(panel.code);
    if (p) {
      for (const testCode of panel.tests) {
        const t = getTestByCode.get(testCode);
        if (t) insertPanelTest.run(p.id, t.id);
      }
    }
  }
});
seedPanels();

// Seed critical values
const insertCritical = db.prepare('INSERT OR IGNORE INTO critical_values (test_id, critical_low, critical_high, action_required) VALUES (?, ?, ?, ?)');
const criticals = [
  ['GLU', 40, 500, 'Notify physician immediately - critical glucose'],
  ['WBC', 2.0, 30.0, 'Notify physician immediately - critical WBC'],
  ['HGB', 5.0, 20.0, 'Notify physician immediately - critical hemoglobin'],
  ['PLT', 20, 1000, 'Notify physician immediately - critical platelet count'],
  ['CREAT', null, 10.0, 'Notify physician immediately - critical creatinine'],
  ['ALT', null, 1000, 'Notify physician immediately - critical liver enzyme'],
  ['TSH', 0.01, 100, 'Notify physician immediately - critical TSH'],
];

const seedCriticals = db.transaction(() => {
  for (const [code, low, high, action] of criticals) {
    const t = getTestByCode.get(code);
    if (t) insertCritical.run(t.id, low, high, action);
  }
});
seedCriticals();

// Seed sample referring physicians
const insertPhysician = db.prepare('INSERT OR IGNORE INTO physicians (name, specialty, clinic, phone, email, license_number) VALUES (?, ?, ?, ?, ?, ?)');
insertPhysician.run('Dr. Sarah Johnson', 'Internal Medicine', 'City Medical Center', '555-0101', 'sjohnson@citymed.com', 'MD-12345');
insertPhysician.run('Dr. Michael Chen', 'Family Medicine', 'Westside Family Clinic', '555-0102', 'mchen@westside.com', 'MD-12346');
insertPhysician.run('Dr. Emily Rodriguez', 'Endocrinology', 'Metro Diabetes Center', '555-0103', 'erodriguez@metrodiab.com', 'MD-12347');

// Seed sample patients for MRI demo
const insertPatient = db.prepare(`
  INSERT OR IGNORE INTO patients (patient_id, first_name, last_name, date_of_birth, gender, phone, email)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
insertPatient.run('PAT-001', 'John', 'Smith', '1985-03-15', 'Male', '555-0201', 'john.smith@email.com');
insertPatient.run('PAT-002', 'Maria', 'Garcia', '1990-07-22', 'Female', '555-0202', 'maria.garcia@email.com');

// Seed sample MRI studies
const seedMRI = db.transaction(() => {
  const pat1 = db.prepare('SELECT id FROM patients WHERE patient_id = ?').get('PAT-001');
  const pat2 = db.prepare('SELECT id FROM patients WHERE patient_id = ?').get('PAT-002');
  if (!pat1 || !pat2) return;

  const insertStudy = db.prepare(`
    INSERT OR IGNORE INTO mri_studies (study_id, patient_id, ordering_physician, body_part, modality, contrast, clinical_indication, priority, status, scheduled_date, performed_date, scanner, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStudy.run('MRI-000001', pat1.id, 'Dr. Sarah Johnson', 'Brain', 'MRI', 'with and without', 'Chronic headaches, rule out mass', 'routine', 'completed', '2026-03-10', '2026-03-10', 'Siemens MAGNETOM Vida 3T', null);
  insertStudy.run('MRI-000002', pat1.id, 'Dr. Michael Chen', 'Lumbar Spine', 'MRI', 'without', 'Lower back pain radiating to left leg', 'urgent', 'completed', '2026-03-15', '2026-03-15', 'GE SIGNA Premier 3T', null);
  insertStudy.run('MRI-000003', pat2.id, 'Dr. Emily Rodriguez', 'Right Knee', 'MRI', 'without', 'Sports injury, suspected meniscal tear', 'routine', 'completed', '2026-03-12', '2026-03-12', 'Siemens MAGNETOM Vida 3T', null);
  insertStudy.run('MRI-000004', pat2.id, 'Dr. Sarah Johnson', 'Brain', 'MRI', 'with', 'Follow-up pituitary adenoma', 'routine', 'scheduled', '2026-03-25', null, null, 'Follow-up from previous MRI 6 months ago');

  // Add MRI images for completed studies
  const insertImage = db.prepare(`
    INSERT OR IGNORE INTO mri_images (study_id, series_number, series_description, image_number, filename, thumbnail, slice_thickness)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const study1 = db.prepare('SELECT id FROM mri_studies WHERE study_id = ?').get('MRI-000001');
  const study2 = db.prepare('SELECT id FROM mri_studies WHERE study_id = ?').get('MRI-000002');
  const study3 = db.prepare('SELECT id FROM mri_studies WHERE study_id = ?').get('MRI-000003');

  if (study1) {
    insertImage.run(study1.id, 1, 'T1 Sagittal', 1, 'brain_t1_sag_001.dcm', null, '5mm');
    insertImage.run(study1.id, 1, 'T1 Sagittal', 2, 'brain_t1_sag_002.dcm', null, '5mm');
    insertImage.run(study1.id, 2, 'T2 Axial', 1, 'brain_t2_ax_001.dcm', null, '5mm');
    insertImage.run(study1.id, 2, 'T2 Axial', 2, 'brain_t2_ax_002.dcm', null, '5mm');
    insertImage.run(study1.id, 3, 'FLAIR Axial', 1, 'brain_flair_ax_001.dcm', null, '5mm');
    insertImage.run(study1.id, 4, 'T1 Post-Contrast Axial', 1, 'brain_t1_post_ax_001.dcm', null, '5mm');
  }
  if (study2) {
    insertImage.run(study2.id, 1, 'T1 Sagittal', 1, 'lspine_t1_sag_001.dcm', null, '4mm');
    insertImage.run(study2.id, 1, 'T1 Sagittal', 2, 'lspine_t1_sag_002.dcm', null, '4mm');
    insertImage.run(study2.id, 2, 'T2 Sagittal', 1, 'lspine_t2_sag_001.dcm', null, '4mm');
    insertImage.run(study2.id, 3, 'T2 Axial', 1, 'lspine_t2_ax_001.dcm', null, '4mm');
  }
  if (study3) {
    insertImage.run(study3.id, 1, 'PD Sagittal', 1, 'knee_pd_sag_001.dcm', null, '3mm');
    insertImage.run(study3.id, 2, 'T2 Coronal', 1, 'knee_t2_cor_001.dcm', null, '3mm');
    insertImage.run(study3.id, 3, 'PD Fat Sat Axial', 1, 'knee_pdfs_ax_001.dcm', null, '3mm');
  }

  // Add MRI reports
  const insertReport = db.prepare(`
    INSERT OR IGNORE INTO mri_reports (study_id, report_status, findings, impression, technique, comparison, recommendations, radiologist, reported_at, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (study1) {
    insertReport.run(study1.id, 'final',
      'The brain parenchyma demonstrates normal gray-white matter differentiation. No evidence of acute infarction, hemorrhage, or mass lesion. The ventricles and sulci are normal in size and configuration for patient age. Midline structures are intact without shift. No abnormal enhancement is identified following contrast administration.\n\nThe major intracranial vessels demonstrate normal flow voids. The orbits, paranasal sinuses, and mastoid air cells are unremarkable. The craniocervical junction is normal.',
      'Normal MRI of the brain with and without contrast. No evidence of intracranial mass, hemorrhage, or acute infarction. No abnormal enhancement.',
      'Multiplanar, multisequence MRI of the brain was performed with and without intravenous gadolinium contrast (15 mL Gadavist). Sequences include sagittal T1, axial T1, axial T2, axial FLAIR, axial DWI, and post-contrast axial and coronal T1.',
      'No prior imaging available for comparison.',
      'Clinical correlation recommended. Follow-up as clinically indicated.',
      'Dr. Robert Williams, MD - Neuroradiology',
      '2026-03-10', '2026-03-10'
    );
  }
  if (study2) {
    insertReport.run(study2.id, 'final',
      'L4-L5: Broad-based disc protrusion with left paracentral component measuring approximately 5mm. There is moderate left neural foraminal narrowing with contact of the traversing left L5 nerve root. Mild facet arthropathy bilaterally.\n\nL5-S1: Small central disc protrusion measuring 3mm without significant neural foraminal narrowing. Mild facet arthropathy.\n\nL3-L4: Mild disc desiccation without significant bulge or protrusion. Patent neural foramina.\n\nThe conus medullaris terminates at the L1 level and is normal in morphology and signal. The visualized cauda equina nerve roots are normal. No epidural abscess or mass is identified. Vertebral body heights and alignment are maintained. The paraspinal soft tissues are unremarkable.',
      '1. L4-L5 broad-based disc protrusion with left paracentral component causing moderate left neural foraminal narrowing and contact of the traversing left L5 nerve root. This correlates with the patient\'s left-sided radiculopathy.\n2. L5-S1 small central disc protrusion without significant nerve root compression.\n3. No spinal canal stenosis.',
      'Multiplanar, multisequence MRI of the lumbar spine was performed without intravenous contrast. Sequences include sagittal T1, sagittal T2, sagittal STIR, and axial T2 through the disc levels.',
      'No prior imaging available for comparison.',
      'Neurosurgical or orthopedic spine consultation may be considered for the L4-L5 findings given clinical symptoms. Conservative management with physical therapy may also be appropriate.',
      'Dr. Robert Williams, MD - Neuroradiology',
      '2026-03-15', '2026-03-15'
    );
  }
  if (study3) {
    insertReport.run(study3.id, 'final',
      'Medial meniscus: There is a horizontal tear of the posterior horn of the medial meniscus extending to the inferior articular surface. The body and anterior horn are intact.\n\nLateral meniscus: Intact without evidence of tear.\n\nACL: Intact with normal signal and morphology.\nPCL: Intact.\nMCL: Intact.\nLCL: Intact.\n\nArticular cartilage: Mild chondromalacia of the medial femoral condyle (Grade II). The lateral compartment and patellofemoral cartilage are preserved.\n\nSmall joint effusion present. No Baker\'s cyst. The extensor mechanism is intact. The popliteal vessels are patent.',
      '1. Horizontal tear of the posterior horn of the medial meniscus.\n2. Mild chondromalacia of the medial femoral condyle (Grade II).\n3. Small joint effusion.\n4. Intact cruciate and collateral ligaments.',
      'Multiplanar, multisequence MRI of the right knee was performed without intravenous contrast. Sequences include sagittal PD, sagittal T2, coronal PD Fat Sat, coronal T2, and axial PD Fat Sat.',
      'No prior imaging available for comparison.',
      'Orthopedic consultation recommended for evaluation of the medial meniscal tear. Consider arthroscopy depending on clinical response to conservative management.',
      'Dr. Amanda Chen, MD - Musculoskeletal Radiology',
      '2026-03-12', '2026-03-12'
    );
  }
});
seedMRI();

console.log('Database setup complete!');
console.log('Default admin credentials: admin / admin123');
console.log(`Database location: ${path.join(__dirname, '..', 'data', 'lis.db')}`);

db.close();
