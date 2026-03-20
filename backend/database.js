const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function setupDatabase() {
    const dbDir = path.join(__dirname, 'database');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'messages.db');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            time TEXT NOT NULL,
            message TEXT NOT NULL,
            emoji_filter TEXT,
            target_suffix TEXT,
            active INTEGER DEFAULT 1,
            last_run_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS message_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id INTEGER,
            contact_name TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            message TEXT NOT NULL,
            scheduled_time DATETIME NOT NULL,
            status TEXT DEFAULT 'pending',
            sent_at DATETIME,
            FOREIGN KEY (rule_id) REFERENCES rules(id)
        );

        -- Índice único: impede duplicação (mesma regra + mesmo contato + mesmo dia UTC)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_no_duplicate_daily 
        ON message_queue (rule_id, contact_number, STRFTIME('%Y-%m-%d', scheduled_time));

        CREATE INDEX IF NOT EXISTS idx_queue_status ON message_queue(status);
    `);

    // Migração segura: adicionar colunas que podem não existir em bancos antigos
    const rulesInfo = await db.all("PRAGMA table_info(rules)");
    const ruleColumns = rulesInfo.map(col => col.name);

    if (!ruleColumns.includes('target_suffix')) {
        await db.exec('ALTER TABLE rules ADD COLUMN target_suffix TEXT');
        console.log('[DB] Migração: coluna target_suffix adicionada.');
    }
    if (!ruleColumns.includes('last_run_date')) {
        await db.exec('ALTER TABLE rules ADD COLUMN last_run_date TEXT');
        console.log('[DB] Migração: coluna last_run_date adicionada.');
    }

    console.log(`[DB] Banco de dados pronto: ${dbPath}`);
    return db;
}

module.exports = setupDatabase;
