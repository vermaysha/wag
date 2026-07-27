import { Database } from 'bun:sqlite';

export const startDbMigration = (db: Database) => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA cache_size = -1000;');
  db.run('PRAGMA temp_store = MEMORY;');
  db.run('PRAGMA mmap_size = 33554432;');
  db.run('PRAGMA auto_vacuum = INCREMENTAL;');

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

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS groups (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at);`,
  );

  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    name TEXT,
    photo_url TEXT,
    status TEXT,
    last_seen INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chat_status (
    chat_jid TEXT PRIMARY KEY,
    last_read_message_key TEXT,
    unread_count INTEGER DEFAULT 0,
    updated_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS media_cache (
    message_key TEXT PRIMARY KEY,
    file_path TEXT,
    mime_type TEXT,
    file_size INTEGER,
    downloaded_at INTEGER
  )`);
};
