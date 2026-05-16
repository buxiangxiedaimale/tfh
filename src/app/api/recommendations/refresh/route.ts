import { NextResponse } from "next/server";
import {
  isWithinManualCooldown,
  readLatestRunSnapshot,
  runHotRecommendation,
} from "@/lib/recommendation/hot-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function refresh() {
  const snapshot = readLatestRunSnapshot();
  if (isWithinManualCooldown(snapshot?.run ?? null)) {
    return NextResponse.json({
      ok: true,
      cooldown: true,
      run: snapshot?.run ?? null,
      message: "最近已生成推荐，请稍候再试",
    });
  }
  const fresh = await runHotRecommendation({
    trigger: "manual",
    forceRefreshPool: true,
  });
  return NextResponse.json({
    ok: true,
    run: fresh.run,
    resultCount: fresh.records.length,
    poolTotal: fresh.pool.total,
  });
}

export async function GET() {
  try {
    return await refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : "刷新推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : "刷新推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
