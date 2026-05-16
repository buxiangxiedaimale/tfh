import { NextResponse } from "next/server";
import {
  ensureUserProfile,
  readMergedProfile,
} from "@/lib/recommendation/profile-generator";
import {
  applyOverrides,
  deleteOverride,
  readActiveProfileRaw,
  readOverrides,
  upsertOverride,
} from "@/lib/server-data/profile-store";
import type { ProfileTagType } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/profile
 *  - 返回当前合并后的画像（如不存在则触发首次生成）
 */
export async function GET() {
  try {
    let profile = readMergedProfile();
    if (!profile) {
      profile = await ensureUserProfile(false);
    }
    const overrides = readOverrides();
    return NextResponse.json({ profile, overrides });
  } catch (e) {
    const message = e instanceof Error ? e.message : "读取画像失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface PostBody {
  action?: "regenerate" | "addTag" | "removeTag" | "deleteOverride";
  tagType?: ProfileTagType;
  tagValue?: string;
  overrideId?: number;
}

/**
 * POST /api/profile
 *  body: { action: "regenerate" }                       强制重新生成画像
 *  body: { action: "addTag", tagType, tagValue }        添加标签覆盖
 *  body: { action: "removeTag", tagType, tagValue }     移除/排除标签
 *  body: { action: "deleteOverride", overrideId }       删除一条覆盖记录
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PostBody;
    const action = body.action;

    if (action === "regenerate") {
      const profile = await ensureUserProfile(true);
      const overrides = readOverrides();
      return NextResponse.json({ profile, overrides, regenerated: true });
    }

    if (action === "addTag" || action === "removeTag") {
      if (!body.tagType || !body.tagValue) {
        return NextResponse.json(
          { error: "缺少 tagType 或 tagValue" },
          { status: 400 }
        );
      }
      upsertOverride({
        tagType: body.tagType,
        tagValue: body.tagValue,
        operation: action === "addTag" ? "add" : "remove",
      });
      const raw = readActiveProfileRaw();
      const overrides = readOverrides();
      const profile = raw ? applyOverrides(raw, overrides) : null;
      return NextResponse.json({ profile, overrides });
    }

    if (action === "deleteOverride") {
      if (typeof body.overrideId !== "number") {
        return NextResponse.json(
          { error: "缺少 overrideId" },
          { status: 400 }
        );
      }
      deleteOverride(body.overrideId);
      const raw = readActiveProfileRaw();
      const overrides = readOverrides();
      const profile = raw ? applyOverrides(raw, overrides) : null;
      return NextResponse.json({ profile, overrides });
    }

    return NextResponse.json({ error: "未知 action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "处理画像请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
