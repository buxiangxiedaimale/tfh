import { NextResponse } from "next/server";
import { runHotRecommendation } from "@/lib/recommendation/hot-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // 未配置 secret 时，仅允许本地调用
    const host = request.headers.get("host") ?? "";
    return host.startsWith("127.0.0.1") || host.startsWith("localhost");
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";
  return provided === expected;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await runHotRecommendation({
      trigger: "cron",
      forceRefreshPool: true,
    });
    return NextResponse.json({
      ok: true,
      run: snapshot.run,
      poolTotal: snapshot.pool.total,
      resultCount: snapshot.records.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "定时刷新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
