import type {
  FeatureScores,
  HotRecommendation,
  RecallChannel,
  UserProfile,
} from "@/types";
import type { RebangHotItem } from "@/lib/rebang/types";
import { getDb } from "./db";

export type RunTrigger = "cron" | "manual" | "lazy" | "feedback";

export interface RecommendationRecord extends HotRecommendation {
  url?: string;
  baseScore?: number;
  llmScore?: number;
  featureScores?: FeatureScores;
  recallChannels?: RecallChannel[];
  exploration?: boolean;
  firstRecommendedAt: string;
  lastRecommendedAt: string;
  item: RebangHotItem & { source?: string };
}

export interface RecommendationRun {
  id: number;
  generatedAt: string;
  durationMs: number | null;
  candidateCount: number;
  resultCount: number;
  trigger: RunTrigger;
  profile: UserProfile | null;
  configured: boolean;
}

export interface SaveRunInput {
  generatedAt: string;
  durationMs: number;
  candidateCount: number;
  trigger: RunTrigger;
  profile: UserProfile | null;
  configured: boolean;
  items: Array<{
    itemKey: string;
    url?: string;
    score: number;
    reason: string;
    matchedInterests: string[];
    baseScore?: number;
    llmScore?: number;
    featureScores?: FeatureScores;
    recallChannels?: RecallChannel[];
    exploration?: boolean;
    item: RebangHotItem & { source?: string };
  }>;
}

type RunRow = {
  id: number;
  generated_at: string;
  duration_ms: number | null;
  candidate_count: number;
  result_count: number;
  trigger: string;
  profile: string | null;
  configured: number;
};

type RecRow = {
  run_id: number;
  item_key: string;
  url: string | null;
  score: number;
  reason: string | null;
  matched_interests: string;
  base_score: number | null;
  llm_score: number | null;
  first_recommended_at: string;
  last_recommended_at: string;
  item_snapshot: string;
  feature_scores: string | null;
  recall_channels: string | null;
  exploration: number | null;
};

function rowToRun(row: RunRow): RecommendationRun {
  let profile: UserProfile | null = null;
  if (row.profile) {
    try {
      profile = JSON.parse(row.profile) as UserProfile;
    } catch {
      profile = null;
    }
  }
  return {
    id: row.id,
    generatedAt: row.generated_at,
    durationMs: row.duration_ms,
    candidateCount: row.candidate_count,
    resultCount: row.result_count,
    trigger: row.trigger as RunTrigger,
    profile,
    configured: row.configured === 1,
  };
}

function rowToRecord(row: RecRow): RecommendationRecord {
  let matched: string[] = [];
  try {
    matched = JSON.parse(row.matched_interests) as string[];
  } catch {
    matched = [];
  }
  let item: RebangHotItem & { source?: string };
  try {
    item = JSON.parse(row.item_snapshot) as RebangHotItem & { source?: string };
  } catch {
    item = {
      item_key: row.item_key,
      title: "",
      describe: "",
      heat_str: "",
      www_url: row.url ?? "",
    } as RebangHotItem;
  }
  let featureScores: FeatureScores | undefined;
  if (row.feature_scores) {
    try {
      featureScores = JSON.parse(row.feature_scores) as FeatureScores;
    } catch {
      featureScores = undefined;
    }
  }
  let recallChannels: RecallChannel[] | undefined;
  if (row.recall_channels) {
    try {
      recallChannels = JSON.parse(row.recall_channels) as RecallChannel[];
    } catch {
      recallChannels = undefined;
    }
  }
  return {
    itemKey: row.item_key,
    url: row.url ?? undefined,
    score: row.score,
    reason: row.reason ?? "",
    matchedInterests: Array.isArray(matched) ? matched : [],
    baseScore: row.base_score ?? undefined,
    llmScore: row.llm_score ?? undefined,
    featureScores,
    recallChannels,
    exploration: (row.exploration ?? 0) === 1,
    firstRecommendedAt: row.first_recommended_at,
    lastRecommendedAt: row.last_recommended_at,
    item,
  };
}

export function readLatestRun(): RecommendationRun | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, generated_at, duration_ms, candidate_count, result_count, trigger, profile, configured FROM recommendation_runs ORDER BY id DESC LIMIT 1"
    )
    .get() as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

export function readRunRecords(runId: number): RecommendationRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT run_id, item_key, url, score, reason, matched_interests, base_score, llm_score, first_recommended_at, last_recommended_at, item_snapshot, feature_scores, recall_channels, exploration FROM recommendations WHERE run_id = ? ORDER BY score DESC`
    )
    .all(runId) as RecRow[];
  return rows.map(rowToRecord);
}

export function readLatestRecommendations(): {
  run: RecommendationRun | null;
  records: RecommendationRecord[];
} {
  const run = readLatestRun();
  if (!run) return { run: null, records: [] };
  const records = readRunRecords(run.id);
  return { run, records };
}

export function getHistoryFirstSeen(urls: string[]): Map<string, string> {
  if (urls.length === 0) return new Map();
  const db = getDb();
  const placeholders = urls.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT url, first_recommended_at FROM recommendation_history WHERE url IN (${placeholders})`
    )
    .all(...urls) as Array<{ url: string; first_recommended_at: string }>;
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.url, row.first_recommended_at);
  }
  return map;
}

export function saveRun(input: SaveRunInput): RecommendationRun {
  const db = getDb();
  const insertRun = db.prepare(`
    INSERT INTO recommendation_runs
      (generated_at, duration_ms, candidate_count, result_count, trigger, profile, configured)
    VALUES
      (@generated_at, @duration_ms, @candidate_count, @result_count, @trigger, @profile, @configured)
  `);
  const insertRec = db.prepare(`
    INSERT INTO recommendations
      (run_id, item_key, url, score, reason, matched_interests, base_score, llm_score, first_recommended_at, last_recommended_at, item_snapshot, feature_scores, recall_channels, exploration)
    VALUES
      (@run_id, @item_key, @url, @score, @reason, @matched_interests, @base_score, @llm_score, @first_recommended_at, @last_recommended_at, @item_snapshot, @feature_scores, @recall_channels, @exploration)
  `);
  const upsertHistory = db.prepare(`
    INSERT INTO recommendation_history (url, first_recommended_at, last_recommended_at, times)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(url) DO UPDATE SET
      last_recommended_at = excluded.last_recommended_at,
      times = times + 1
  `);
  const trim = db.prepare(`
    DELETE FROM recommendation_runs
    WHERE id IN (
      SELECT id FROM recommendation_runs
      ORDER BY id DESC
      LIMIT -1 OFFSET 30
    )
  `);

  const urls = input.items
    .map((item) => item.url)
    .filter((url): url is string => Boolean(url));
  const historyMap = getHistoryFirstSeen(urls);

  let runId = 0;
  const tx = db.transaction(() => {
    const info = insertRun.run({
      generated_at: input.generatedAt,
      duration_ms: input.durationMs,
      candidate_count: input.candidateCount,
      result_count: input.items.length,
      trigger: input.trigger,
      profile: input.profile ? JSON.stringify(input.profile) : null,
      configured: input.configured ? 1 : 0,
    });
    runId = Number(info.lastInsertRowid);
    for (const rec of input.items) {
      const url = rec.url ?? null;
      const firstSeen =
        (url && historyMap.get(url)) ?? input.generatedAt;
      insertRec.run({
        run_id: runId,
        item_key: rec.itemKey,
        url,
        score: rec.score,
        reason: rec.reason,
        matched_interests: JSON.stringify(rec.matchedInterests ?? []),
        base_score: rec.baseScore ?? null,
        llm_score: rec.llmScore ?? null,
        first_recommended_at: firstSeen,
        last_recommended_at: input.generatedAt,
        item_snapshot: JSON.stringify(rec.item),
        feature_scores: rec.featureScores
          ? JSON.stringify(rec.featureScores)
          : null,
        recall_channels: rec.recallChannels
          ? JSON.stringify(rec.recallChannels)
          : null,
        exploration: rec.exploration ? 1 : 0,
      });
      if (url) {
        upsertHistory.run(url, firstSeen, input.generatedAt);
      }
    }
    trim.run();
  });
  tx();

  return {
    id: runId,
    generatedAt: input.generatedAt,
    durationMs: input.durationMs,
    candidateCount: input.candidateCount,
    resultCount: input.items.length,
    trigger: input.trigger,
    profile: input.profile,
    configured: input.configured,
  };
}
