const Database = require('better-sqlite3');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'lis.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
