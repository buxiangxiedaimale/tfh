import type { InterestItem } from "@/types";
import { bufferToVector, getDb, vectorToBuffer } from "./db";

export type EmbeddingCache = Record<string, number[]>;

type InterestRow = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  source: string | null;
  heat: string | null;
  keywords: string;
  embedding_key: string | null;
  weight: number;
  created_at: string;
  updated_at: string;
};

function rowToInterest(row: InterestRow): InterestItem {
  let keywords: string[] = [];
  try {
    keywords = JSON.parse(row.keywords) as string[];
  } catch {
    keywords = [];
  }
  return {
    id: row.id,
    kind: row.kind as InterestItem["kind"],
    title: row.title,
    url: row.url ?? undefined,
    source: row.source ?? undefined,
    heat: row.heat ?? undefined,
    keywords: Array.isArray(keywords) ? keywords : [],
    embeddingKey: row.embedding_key ?? undefined,
    weight: row.weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function readInterests(): Promise<InterestItem[]> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, kind, title, url, source, heat, keywords, embedding_key, weight, created_at, updated_at FROM interests ORDER BY updated_at DESC LIMIT 5000"
    )
    .all() as InterestRow[];
  return rows.map(rowToInterest);
}

export async function writeInterests(items: InterestItem[]): Promise<void> {
  const db = getDb();
  const limited = items.slice(0, 5000);
  const keepIds = new Set(limited.map((item) => item.id));
  const upsert = db.prepare(`
    INSERT INTO interests
      (id, kind, title, url, source, heat, keywords, embedding_key, weight, created_at, updated_at)
    VALUES
      (@id, @kind, @title, @url, @source, @heat, @keywords, @embedding_key, @weight, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      url = excluded.url,
      source = excluded.source,
      heat = excluded.heat,
      keywords = excluded.keywords,
      embedding_key = excluded.embedding_key,
      weight = excluded.weight,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const allIds = (
    db.prepare("SELECT id FROM interests").all() as Array<{ id: string }>
  ).map((row) => row.id);
  const idsToDelete = allIds.filter((id) => !keepIds.has(id));
  const del = db.prepare("DELETE FROM interests WHERE id = ?");
  const tx = db.transaction(() => {
    for (const id of idsToDelete) del.run(id);
    for (const item of limited) {
      upsert.run({
        id: item.id,
        kind: item.kind,
        title: item.title,
        url: item.url ?? null,
        source: item.source ?? null,
        heat: item.heat ?? null,
        keywords: JSON.stringify(item.keywords ?? []),
        embedding_key: item.embeddingKey ?? null,
        weight: item.weight,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      });
    }
  });
  tx();
}

export async function upsertInterest(item: InterestItem): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO interests
      (id, kind, title, url, source, heat, keywords, embedding_key, weight, created_at, updated_at)
    VALUES
      (@id, @kind, @title, @url, @source, @heat, @keywords, @embedding_key, @weight, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      title = excluded.title,
      url = excluded.url,
      source = excluded.source,
      heat = excluded.heat,
      keywords = excluded.keywords,
      embedding_key = excluded.embedding_key,
      weight = excluded.weight,
      updated_at = excluded.updated_at
  `).run({
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url ?? null,
    source: item.source ?? null,
    heat: item.heat ?? null,
    keywords: JSON.stringify(item.keywords ?? []),
    embedding_key: item.embeddingKey ?? null,
    weight: item.weight,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  });
}

export async function findInterestByUrl(url: string): Promise<InterestItem | null> {
  if (!url) return null;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, kind, title, url, source, heat, keywords, embedding_key, weight, created_at, updated_at FROM interests WHERE url = ? LIMIT 1"
    )
    .get(url) as InterestRow | undefined;
  return row ? rowToInterest(row) : null;
}

export async function readEmbeddingCache(): Promise<EmbeddingCache> {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, vector FROM embeddings")
    .all() as Array<{ key: string; vector: Buffer }>;
  const cache: EmbeddingCache = {};
  for (const row of rows) {
    cache[row.key] = bufferToVector(row.vector);
  }
  return cache;
}

export async function writeEmbeddingCache(cache: EmbeddingCache): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO embeddings (key, vector, dim, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      vector = excluded.vector,
      dim = excluded.dim
  `);
  const tx = db.transaction(() => {
    for (const [key, vector] of Object.entries(cache)) {
      if (!Array.isArray(vector) || vector.length === 0) continue;
      upsert.run(key, vectorToBuffer(vector), vector.length, now);
    }
  });
  tx();
}

export async function getEmbeddingFromDb(
  key: string
): Promise<number[] | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT vector FROM embeddings WHERE key = ?")
    .get(key) as { vector: Buffer } | undefined;
  return row ? bufferToVector(row.vector) : null;
}

export async function putEmbeddingToDb(
  key: string,
  vector: number[]
): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO embeddings (key, vector, dim, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      vector = excluded.vector,
      dim = excluded.dim
  `).run(key, vectorToBuffer(vector), vector.length, new Date().toISOString());
}
