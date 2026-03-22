'use strict';

const Database = require('better-sqlite3');
const config = require('./config');

let db;

function getDb() {
  if (!db) {
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS media (
        id              TEXT PRIMARY KEY,
        path            TEXT UNIQUE NOT NULL,
        name            TEXT NOT NULL,
        folder          TEXT NOT NULL,
        type            TEXT NOT NULL,
        size            INTEGER,
        duration        REAL,
        width           INTEGER,
        height          INTEGER,
        codec           TEXT,
        container       TEXT,
        needs_transcode INTEGER DEFAULT 0,
        scanned_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_folder ON media(folder);
      CREATE INDEX IF NOT EXISTS idx_type   ON media(type);
    `);
  }
  return db;
}

function getById(id) {
  return getDb().prepare('SELECT * FROM media WHERE id = ?').get(id) || null;
}

function list({ folder, type, page = 1, limit = 100 } = {}) {
  let sql = 'SELECT * FROM media WHERE 1=1';
  const params = [];

  if (folder) { sql += ' AND folder = ?'; params.push(folder); }
  if (type)   { sql += ' AND type = ?';   params.push(type); }

  const total = getDb().prepare(sql.replace('SELECT *', 'SELECT COUNT(*)')).get(...params)['COUNT(*)'];
  sql += ' ORDER BY folder, name LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const items = getDb().prepare(sql).all(...params);
  return { items, total, page, limit };
}

function listFolders() {
  return getDb().prepare('SELECT DISTINCT folder FROM media ORDER BY folder').all().map(r => r.folder);
}

function upsert(record) {
  getDb().prepare(`
    INSERT INTO media (id, path, name, folder, type, size, duration, width, height, codec, container, needs_transcode, scanned_at)
    VALUES (@id, @path, @name, @folder, @type, @size, @duration, @width, @height, @codec, @container, @needs_transcode, @scanned_at)
    ON CONFLICT(path) DO UPDATE SET
      name=excluded.name, folder=excluded.folder, type=excluded.type, size=excluded.size,
      duration=excluded.duration, width=excluded.width, height=excluded.height,
      codec=excluded.codec, container=excluded.container,
      needs_transcode=excluded.needs_transcode, scanned_at=excluded.scanned_at
  `).run(record);
}

function removeStale(knownPaths) {
  if (knownPaths.length === 0) return;
  const placeholders = knownPaths.map(() => '?').join(',');
  getDb().prepare(`DELETE FROM media WHERE path NOT IN (${placeholders})`).run(...knownPaths);
}

module.exports = { getDb, getById, list, listFolders, upsert, removeStale };
