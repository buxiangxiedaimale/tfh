import { NextResponse } from "next/server";
import {
  isRunStale,
  isWithinManualCooldown,
  readLatestRunSnapshot,
  runHotRecommendation,
} from "@/lib/recommendation/hot-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let inflight: Promise<unknown> | null = null;

function snapshotPayload(snapshot: ReturnType<typeof readLatestRunSnapshot>) {
  if (!snapshot) {
    return {
      run: null,
      records: [] as never[],
      pool: { total: 0 },
    };
  }
  return snapshot;
}

async function lazyRefreshIfStale() {
  const snapshot = readLatestRunSnapshot();
  if (!isRunStale(snapshot?.run ?? null)) return;
  if (inflight) return;
  inflight = runHotRecommendation({ trigger: "lazy" })
    .catch((error) => {
      console.error("[recommend] lazy refresh failed", error);
    })
    .finally(() => {
      inflight = null;
    });
}

export async function GET() {
  try {
    const snapshot = readLatestRunSnapshot();
    if (!snapshot) {
      // 首次调用，同步跱一次生成，以免前端拿不到任何数据
      const fresh = await runHotRecommendation({ trigger: "lazy" });
      return NextResponse.json(snapshotPayload(fresh));
    }
    // 过期则后台异步刷新，当次请求仍返回旧结果
    void lazyRefreshIfStale();
    return NextResponse.json(snapshotPayload(snapshot));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const force = Boolean(body.force);

    if (force) {
      const snapshot = readLatestRunSnapshot();
      if (isWithinManualCooldown(snapshot?.run ?? null)) {
        return NextResponse.json(
          {
            ...snapshotPayload(snapshot),
            cooldown: true,
            message: "最近已生成推荐，请稍候再试",
          },
          { status: 200 }
        );
      }
      const fresh = await runHotRecommendation({
        trigger: "manual",
        forceRefreshPool: true,
      });
      return NextResponse.json(snapshotPayload(fresh));
    }

    const snapshot = readLatestRunSnapshot();
    if (!snapshot) {
      const fresh = await runHotRecommendation({ trigger: "lazy" });
      return NextResponse.json(snapshotPayload(fresh));
    }
    void lazyRefreshIfStale();
    return NextResponse.json(snapshotPayload(snapshot));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
