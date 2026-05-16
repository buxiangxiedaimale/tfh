import { getDb } from "./db";
import type {
  ProfileOverride,
  ProfileTagType,
  UserProfile,
} from "@/types";

/* ============================================================
 * 用户画像存储
 * ============================================================ */

type ProfileRow = {
  id: number;
  content: string;
  generated_at: string;
  source: string;
  interest_count: number;
  active: number;
};

function rowToProfile(row: ProfileRow): UserProfile | null {
  try {
    const parsed = JSON.parse(row.content) as Omit<
      UserProfile,
      "generatedAt" | "source" | "interestCount"
    >;
    return {
      identity: Array.isArray(parsed.identity) ? parsed.identity : [],
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
      styles: Array.isArray(parsed.styles) ? parsed.styles : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      identityInferences: parsed.identityInferences,
      stats: parsed.stats ?? {
        total: 0,
        positive: 0,
        negative: 0,
        readLater: 0,
      },
      generatedAt: row.generated_at,
      source: (row.source as UserProfile["source"]) ?? "llm",
      interestCount: row.interest_count,
    };
  } catch {
    return null;
  }
}

/**
 * 读取当前 active 的原始画像（未合并 override）。
 */
export function readActiveProfileRaw(): UserProfile | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, content, generated_at, source, interest_count, active FROM user_profiles WHERE active = 1 ORDER BY id DESC LIMIT 1"
    )
    .get() as ProfileRow | undefined;
  if (!row) return null;
  return rowToProfile(row);
}

/**
 * 写入一份新画像并把它设为 active。旧画像保留但 active=0。
 */
export function saveProfile(input: {
  profile: Omit<UserProfile, "generatedAt" | "source" | "interestCount">;
  source: UserProfile["source"];
  interestCount: number;
}): UserProfile {
  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE user_profiles SET active = 0 WHERE active = 1").run();
    db.prepare(
      "INSERT INTO user_profiles (content, generated_at, source, interest_count, active) VALUES (?, ?, ?, ?, 1)"
    ).run(
      JSON.stringify(input.profile),
      now,
      input.source,
      input.interestCount
    );
    // 仅保留最近 10 条历史画像
    db.prepare(
      `DELETE FROM user_profiles WHERE id IN (SELECT id FROM user_profiles ORDER BY id DESC LIMIT -1 OFFSET 10)`
    ).run();
  });
  tx();
  return {
    ...input.profile,
    generatedAt: now,
    source: input.source,
    interestCount: input.interestCount,
  };
}

/* ============================================================
 * 画像覆盖（用户手动添加/删除标签）
 * ============================================================ */

type OverrideRow = {
  id: number;
  tag_type: string;
  tag_value: string;
  operation: string;
  created_at: string;
};

function rowToOverride(row: OverrideRow): ProfileOverride {
  return {
    id: row.id,
    tagType: row.tag_type as ProfileTagType,
    tagValue: row.tag_value,
    operation: row.operation as ProfileOverride["operation"],
    createdAt: row.created_at,
  };
}

export function readOverrides(): ProfileOverride[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, tag_type, tag_value, operation, created_at FROM profile_overrides ORDER BY id ASC"
    )
    .all() as OverrideRow[];
  return rows.map(rowToOverride);
}

/**
 * 添加一个覆盖。同 (tagType, tagValue) 同时存在 add 和 remove 时，
 * 后写入的会替换前一个（先删除冲突项再插入）。
 */
export function upsertOverride(input: {
  tagType: ProfileTagType;
  tagValue: string;
  operation: ProfileOverride["operation"];
}): ProfileOverride {
  const db = getDb();
  const now = new Date().toISOString();
  const value = input.tagValue.trim();
  if (!value) throw new Error("tagValue 不能为空");
  const opposite =
    input.operation === "add" ? "remove" : "add";
  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM profile_overrides WHERE tag_type = ? AND tag_value = ? AND operation = ?"
    ).run(input.tagType, value, opposite);
    db.prepare(
      `INSERT OR REPLACE INTO profile_overrides (tag_type, tag_value, operation, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(input.tagType, value, input.operation, now);
  });
  tx();
  const row = db
    .prepare(
      "SELECT id, tag_type, tag_value, operation, created_at FROM profile_overrides WHERE tag_type = ? AND tag_value = ? AND operation = ?"
    )
    .get(input.tagType, value, input.operation) as OverrideRow;
  return rowToOverride(row);
}

export function deleteOverride(id: number): boolean {
  const db = getDb();
  const info = db
    .prepare("DELETE FROM profile_overrides WHERE id = ?")
    .run(id);
  return info.changes > 0;
}

/**
 * 用 overrides 修补原始画像。
 *  - add: 把 tagValue 加到对应数组（去重）
 *  - remove: 从对应数组里移除
 */
export function applyOverrides(
  profile: UserProfile,
  overrides: ProfileOverride[]
): UserProfile {
  const next: UserProfile = {
    ...profile,
    identity: [...profile.identity],
    domains: profile.domains.map((d) => ({ ...d, subtopics: [...d.subtopics] })),
    styles: [...profile.styles],
    avoid: [...profile.avoid],
  };

  const addToArray = (arr: string[], val: string) => {
    if (!arr.includes(val)) arr.push(val);
  };
  const removeFromArray = (arr: string[], val: string) => {
    const idx = arr.indexOf(val);
    if (idx >= 0) arr.splice(idx, 1);
  };

  for (const ov of overrides) {
    const value = ov.tagValue.trim();
    if (!value) continue;
    if (ov.tagType === "identity") {
      if (ov.operation === "add") addToArray(next.identity, value);
      else removeFromArray(next.identity, value);
    } else if (ov.tagType === "style") {
      if (ov.operation === "add") addToArray(next.styles, value);
      else removeFromArray(next.styles, value);
    } else if (ov.tagType === "avoid") {
      if (ov.operation === "add") addToArray(next.avoid, value);
      else removeFromArray(next.avoid, value);
    } else if (ov.tagType === "domain") {
      if (ov.operation === "add") {
        if (!next.domains.find((d) => d.name === value)) {
          next.domains.push({ name: value, weight: 0.7, subtopics: [] });
        }
      } else {
        const idx = next.domains.findIndex((d) => d.name === value);
        if (idx >= 0) next.domains.splice(idx, 1);
      }
    }
  }
  return next;
}
