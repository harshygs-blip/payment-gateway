import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure db directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'gateway.db');
const db = new sqlite3.Database(dbPath);

// Async wrapper helpers
export const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

export async function getSetting(key, defaultValue = '') {
  try {
    const row = await query.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

export async function setSetting(key, value) {
  const strValue = String(value);
  await query.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, strValue]
  );
}

export async function getAllSettings() {
  try {
    const rows = await query.all('SELECT key, value FROM settings');
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  } catch (_) {
    return {};
  }
}

export async function initDatabase() {
  // 1. Orders table
  await query.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      customer_name TEXT DEFAULT 'Guest',
      customer_phone TEXT DEFAULT '',
      status TEXT DEFAULT 'PENDING',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      paid_at INTEGER,
      utr TEXT,
      sender_info TEXT,
      webhook_url TEXT,
      webhook_status TEXT
    )
  `);

  // 2. Payments table
  await query.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      utr TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      sender TEXT,
      received_at INTEGER NOT NULL,
      source TEXT DEFAULT 'IMAP',
      raw_snippet TEXT,
      matched_order_id INTEGER,
      is_matched INTEGER DEFAULT 0,
      FOREIGN KEY (matched_order_id) REFERENCES orders(id)
    )
  `);

  // 3. Settings table
  await query.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  console.log('[DB] SQLite database initialized at:', dbPath);
}

export function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export default { query, initDatabase, closeDatabase, getSetting, setSetting, getAllSettings };
