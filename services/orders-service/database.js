const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

const dbPath = path.join(__dirname, 'orders.db');

const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('Erreur ouverture DB :', err.message);
    } else {
      console.log('Connecte a la base SQLite (orders.db)');

      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        items_json TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'PENDING',
        created_at TEXT DEFAULT (datetime('now'))
      )`, (err) => {
        if (err) {
          console.error('Erreur creation table :', err.message);
        } else {
          console.log('Table orders prete');
        }
      });
    }
  }
);

module.exports = db;
