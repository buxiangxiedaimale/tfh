import type { RebangHotItem } from "@/lib/rebang/types";
import { getDb } from "./db";

export interface HotPoolEntry extends RebangHotItem {
  source?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface HotPoolUpsertInput {
  url: string;
  itemKey: string;
  title: string;
  describe?: string;
  heatStr?: string;
  source?: string;
  sourceKey?: string;
  subTab?: string;
  raw: RebangHotItem;
}

const POOL_TTL_MS = 24 * 60 * 60 * 1000;

type Row = {
  url: string;
  item_key: string;
  title: string;
  describe: string | null;
  heat_str: string | null;
  source: string | null;
  source_key: string | null;
  sub_tab: string | null;
  raw: string;
  first_seen_at: string;
  last_seen_at: string;
};

function rowToEntry(row: Row): HotPoolEntry {
  let raw: RebangHotItem;
  try {
    raw = JSON.parse(row.raw) as RebangHotItem;
  } catch {
    raw = {
      item_key: row.item_key,
      title: row.title,
      describe: row.describe ?? "",
      heat_str: row.heat_str ?? "",
      www_url: row.url,
    } as RebangHotItem;
  }
  return {
    ...raw,
    item_key: row.item_key,
    title: row.title,
    describe: row.describe ?? raw.describe,
    heat_str: row.heat_str ?? raw.heat_str,
    www_url: row.url,
    source: row.source ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function purgeExpiredHotPool(now: Date = new Date()): number {
  const db = getDb();
  const cutoff = new Date(now.getTime() - POOL_TTL_MS).toISOString();
  const info = db
    .prepare("DELETE FROM hot_pool WHERE last_seen_at < ?")
    .run(cutoff);
  return Number(info.changes ?? 0);
}

export function readHotPool(): HotPoolEntry[] {
  purgeExpiredHotPool();
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT url, item_key, title, describe, heat_str, source, source_key, sub_tab, raw, first_seen_at, last_seen_at FROM hot_pool ORDER BY last_seen_at DESC"
    )
    .all() as Row[];
  return rows.map(rowToEntry);
}

export function upsertHotPool(items: HotPoolUpsertInput[]): {
  inserted: number;
  updated: number;
  total: number;
} {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO hot_pool
      (url, item_key, title, describe, heat_str, source, source_key, sub_tab, raw, first_seen_at, last_seen_at)
    VALUES
      (@url, @item_key, @title, @describe, @heat_str, @source, @source_key, @sub_tab, @raw, @now, @now)
    ON CONFLICT(url) DO UPDATE SET
      item_key = excluded.item_key,
      title = excluded.title,
      describe = excluded.describe,
      heat_str = excluded.heat_str,
      source = excluded.source,
      source_key = excluded.source_key,
      sub_tab = excluded.sub_tab,
      raw = excluded.raw,
      last_seen_at = excluded.last_seen_at
  `);
  let inserted = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const item of items) {
      if (!item.url) continue;
      const existing = db
        .prepare("SELECT 1 FROM hot_pool WHERE url = ?")
        .get(item.url);
      stmt.run({
        url: item.url,
        item_key: item.itemKey,
        title: item.title,
        describe: item.describe ?? null,
        heat_str: item.heatStr ?? null,
        source: item.source ?? null,
        source_key: item.sourceKey ?? null,
        sub_tab: item.subTab ?? null,
        raw: JSON.stringify(item.raw),
        now,
      });
      if (existing) updated += 1;
      else inserted += 1;
    }
  });
  tx();
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM hot_pool").get() as { n: number }
  ).n;
  return { inserted, updated, total };
}

export function clearHotPool(): void {
  getDb().prepare("DELETE FROM hot_pool").run();
}
