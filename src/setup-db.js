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

console.log('Database setup complete!');
console.log('Default admin credentials: admin / admin123');
console.log(`Database location: ${path.join(__dirname, '..', 'data', 'lis.db')}`);

db.close();
