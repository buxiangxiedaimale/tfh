import { NextResponse } from "next/server";
import {
  collectGlobalHotCandidates,
  recommendHotItems,
} from "@/lib/recommendation/hot-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      items?: Parameters<typeof recommendHotItems>[0];
      mode?: "current" | "global";
    };

    const items =
      body.mode === "current" && Array.isArray(body.items)
        ? body.items
        : await collectGlobalHotCandidates();

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "缺少热搜候选列表" }, { status: 400 });
    }

    const result = await recommendHotItems(items);
    return NextResponse.json({ ...result, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const items = await collectGlobalHotCandidates();
    const result = await recommendHotItems(items);
    return NextResponse.json({ ...result, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
