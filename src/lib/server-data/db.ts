import Database from "better-sqlite3";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "app.db");

let _db: Database.Database | null = null;
let _migratedFromJson = false;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function applySchema(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      source TEXT,
      heat TEXT,
      keywords TEXT NOT NULL DEFAULT '[]',
      embedding_key TEXT,
      weight REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_interests_url ON interests(url);
    CREATE INDEX IF NOT EXISTS idx_interests_updated ON interests(updated_at DESC);

    CREATE TABLE IF NOT EXISTS embeddings (
      key TEXT PRIMARY KEY,
      vector BLOB NOT NULL,
      dim INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hot_pool (
      url TEXT PRIMARY KEY,
      item_key TEXT NOT NULL,
      title TEXT NOT NULL,
      describe TEXT,
      heat_str TEXT,
      source TEXT,
      source_key TEXT,
      sub_tab TEXT,
      raw TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hot_pool_last_seen ON hot_pool(last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS recommendation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      duration_ms INTEGER,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      result_count INTEGER NOT NULL DEFAULT 0,
      trigger TEXT NOT NULL,
      profile TEXT,
      configured INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_runs_generated ON recommendation_runs(generated_at DESC);

    CREATE TABLE IF NOT EXISTS recommendations (
      run_id INTEGER NOT NULL,
      item_key TEXT NOT NULL,
      url TEXT,
      score REAL NOT NULL,
      reason TEXT,
      matched_interests TEXT NOT NULL DEFAULT '[]',
      base_score REAL,
      llm_score REAL,
      first_recommended_at TEXT NOT NULL,
      last_recommended_at TEXT NOT NULL,
      item_snapshot TEXT NOT NULL,
      PRIMARY KEY (run_id, item_key),
      FOREIGN KEY (run_id) REFERENCES recommendation_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recommendation_history (
      url TEXT PRIMARY KEY,
      first_recommended_at TEXT NOT NULL,
      last_recommended_at TEXT NOT NULL,
      times INTEGER NOT NULL DEFAULT 1
    );
  `);
}

function tryMigrateInterestsJson(db: Database.Database) {
  const file = path.join(DATA_DIR, "interests.json");
  if (!existsSync(file)) return;
  const exists = db.prepare("SELECT COUNT(*) AS n FROM interests").get() as {
    n: number;
  };
  if (exists.n > 0) return;
  try {
    const raw = readFileSync(file, "utf8");
    const items = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(items) || items.length === 0) return;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO interests
      (id, kind, title, url, source, heat, keywords, embedding_key, weight, created_at, updated_at)
      VALUES (@id, @kind, @title, @url, @source, @heat, @keywords, @embedding_key, @weight, @created_at, @updated_at)
    `);
    const insertMany = db.transaction((rows: Array<Record<string, unknown>>) => {
      for (const row of rows) {
        stmt.run({
          id: String(row.id ?? ""),
          kind: String(row.kind ?? "positive"),
          title: String(row.title ?? ""),
          url: (row.url as string | undefined) ?? null,
          source: (row.source as string | undefined) ?? null,
          heat: (row.heat as string | undefined) ?? null,
          keywords: JSON.stringify(row.keywords ?? []),
          embedding_key: (row.embeddingKey as string | undefined) ?? null,
          weight: Number(row.weight ?? 0),
          created_at: String(row.createdAt ?? new Date().toISOString()),
          updated_at: String(row.updatedAt ?? new Date().toISOString()),
        });
      }
    });
    insertMany(items);
    renameSync(file, `${file}.migrated`);
  } catch (error) {
    console.error("[db] interests.json 迁移失败", error);
  }
}

function tryMigrateEmbeddingsJson(db: Database.Database) {
  const file = path.join(DATA_DIR, "embedding-cache.json");
  if (!existsSync(file)) return;
  const exists = db.prepare("SELECT COUNT(*) AS n FROM embeddings").get() as {
    n: number;
  };
  if (exists.n > 0) return;
  try {
    const raw = readFileSync(file, "utf8");
    const obj = JSON.parse(raw) as Record<string, number[]>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return;
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO embeddings (key, vector, dim, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertMany = db.transaction((entries: Array<[string, number[]]>) => {
      for (const [key, vec] of entries) {
        if (!Array.isArray(vec) || vec.length === 0) continue;
        const buf = Buffer.from(new Float32Array(vec).buffer);
        stmt.run(key, buf, vec.length, now);
      }
    });
    insertMany(keys.map((k) => [k, obj[k]] as [string, number[]]));
    renameSync(file, `${file}.migrated`);
  } catch (error) {
    console.error("[db] embedding-cache.json 迁移失败", error);
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;
  ensureDataDir();
  const db = new Database(DB_FILE);
  applySchema(db);
  if (!_migratedFromJson) {
    tryMigrateInterestsJson(db);
    tryMigrateEmbeddingsJson(db);
    _migratedFromJson = true;
  }
  _db = db;
  return db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function vectorToBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

export function bufferToVector(buf: Buffer): number[] {
  const arr = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / 4
  );
  return Array.from(arr);
}
