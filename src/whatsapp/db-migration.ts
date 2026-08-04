import { Database } from 'bun:sqlite';

export const startDbMigration = (db: Database) => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA cache_size = -1000;');
  db.run('PRAGMA temp_store = MEMORY;');
  db.run('PRAGMA mmap_size = 33554432;');
  db.run('PRAGMA auto_vacuum = INCREMENTAL;');
  db.run('PRAGMA busy_timeout = 5000;');

  if (Bun.env.NODE_ENV === 'production') {
    db.run('PRAGMA locking_mode = EXCLUSIVE;'); // Exclusive locking for single-writer scenarios
  } else {
    db.run('PRAGMA locking_mode = NORMAL;'); // Normal locking for development
  }

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS groups (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    name TEXT,
    photo_url TEXT,
    status TEXT,
    last_seen INTEGER
  )`);

  // Legacy tables from when messages were persisted — no longer used
  db.run(`DROP TABLE IF EXISTS messages`);
  db.run(`DROP TABLE IF EXISTS media_cache`);
  db.run(`DROP TABLE IF EXISTS chat_status`);
};
