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
`);

// Seed default admin user
const hashedPassword = bcrypt.hashSync('admin123', 10);
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, full_name, role, email)
  VALUES (?, ?, ?, ?, ?)
`);
insertUser.run('admin', hashedPassword, 'System Administrator', 'admin', 'admin@lab.com');

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
];

const insertTests = db.transaction(() => {
  for (const test of tests) {
    insertTest.run(...test);
  }
});
insertTests();

console.log('Database setup complete!');
console.log('Default admin credentials: admin / admin123');
console.log(`Database location: ${path.join(__dirname, '..', 'data', 'lis.db')}`);

db.close();
