import { getDb } from "./db";

export interface ExposureRecord {
  url: string;
  exposureCount: number;
  firstExposedAt: string;
  lastExposedAt: string;
  hasPositiveFeedback: boolean;
}

type Row = {
  url: string;
  exposure_count: number;
  first_exposed_at: string;
  last_exposed_at: string;
  has_positive_feedback: number;
};

function rowToRecord(row: Row): ExposureRecord {
  return {
    url: row.url,
    exposureCount: row.exposure_count,
    firstExposedAt: row.first_exposed_at,
    lastExposedAt: row.last_exposed_at,
    hasPositiveFeedback: row.has_positive_feedback === 1,
  };
}

export function getExposureMap(urls: string[]): Map<string, ExposureRecord> {
  const map = new Map<string, ExposureRecord>();
  if (urls.length === 0) return map;
  const db = getDb();
  const chunkSize = 400;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT url, exposure_count, first_exposed_at, last_exposed_at, has_positive_feedback
         FROM recommendation_exposures WHERE url IN (${placeholders})`
      )
      .all(...chunk) as Row[];
    for (const row of rows) {
      map.set(row.url, rowToRecord(row));
    }
  }
  return map;
}

/**
 * 把这批被推荐的 url 的曝光次数 +1，更新 last_exposed_at。
 */
export function bumpExposures(urls: string[], at: string): void {
  if (urls.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO recommendation_exposures
      (url, exposure_count, first_exposed_at, last_exposed_at, has_positive_feedback)
    VALUES (?, 1, ?, ?, 0)
    ON CONFLICT(url) DO UPDATE SET
      exposure_count = exposure_count + 1,
      last_exposed_at = excluded.last_exposed_at
  `);
  const tx = db.transaction(() => {
    for (const url of urls) {
      stmt.run(url, at, at);
    }
  });
  tx();
}

/**
 * 标记某个 url 已经收到了正向反馈（感兴趣/稍后看/转待办）。
 */
export function markPositiveFeedback(url: string): void {
  if (!url) return;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recommendation_exposures
       (url, exposure_count, first_exposed_at, last_exposed_at, has_positive_feedback)
     VALUES (?, 0, ?, ?, 1)
     ON CONFLICT(url) DO UPDATE SET
       has_positive_feedback = 1,
       last_exposed_at = excluded.last_exposed_at`
  ).run(url, now, now);
}

/**
 * 疲劳分计算：
 *  - 曝光次数越多惩罚越大
 *  - 已经被正向反馈过的不再扣分（用户喜欢就该多看）
 *  - 最近曝光过的扣得更狠（避免几小时内重复推荐）
 * 返回 0~1 之间的疲劳系数，1 = 完全疲劳应淘汰，0 = 无疲劳。
 */
export function fatigueScore(
  record: ExposureRecord | undefined,
  now: number = Date.now()
): number {
  if (!record) return 0;
  if (record.hasPositiveFeedback) return 0;
  if (record.exposureCount <= 0) return 0;
  const hoursSinceLast =
    (now - new Date(record.lastExposedAt).getTime()) / 3_600_000;
  // 曝光次数惩罚: 1 次=0.1, 2 次=0.2, 3 次=0.4, 5 次=0.7, 8+ 次=0.95
  const countPenalty = Math.min(
    0.95,
    Math.pow(Math.max(0, record.exposureCount - 1), 1.3) * 0.1
  );
  // 时间衰减: 24h 后惩罚减半，72h 后归零
  const timeDecay = Math.max(0, 1 - hoursSinceLast / 72);
  return Math.min(1, countPenalty * timeDecay);
}
