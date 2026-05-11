const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

// La base de données sera dans users.db (à côté de server.js)
const dbPath = path.join(__dirname, 'users.db');

const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error(' Erreur ouverture DB :', err.message);
    } else {
      console.log(' Connecté à la base SQLite (users.db)');
      
      // Créer la table users si elle n'existe pas
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL
      )`, (err) => {
        if (err) {
          console.error('Erreur création table :', err.message);
        } else {
          console.log(' Table users prête');
        }
      });
    }
  }
);

module.exports = db;
