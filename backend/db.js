const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const fs = require('fs');
const dbDir = path.resolve(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'messages.db');

if (!fs.existsSync(dbPath)) {
    console.log('Creating database file...');
    fs.writeFileSync(dbPath, '');
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) console.error('Database opening error: ', err);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    contactName TEXT,
    text TEXT NOT NULL,
    scheduledDate DATETIME NOT NULL,
    status TEXT DEFAULT 'PENDING',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migrate existing table safely if starting up an older db
  db.run(`ALTER TABLE messages ADD COLUMN contactName TEXT`, (err) => {
    // Ignore error if column already exists
  });

  db.run(`CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    targetSuffix TEXT NOT NULL,
    timeOfDay TEXT NOT NULL,
    frequency TEXT NOT NULL,
    messageTemplate TEXT NOT NULL,
    lastRunDate TEXT DEFAULT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;
