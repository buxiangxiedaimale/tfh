import { NextResponse } from "next/server";
import {
  collectGlobalHotCandidates,
  recommendHotItems,
} from "@/lib/recommendation/hot-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await collectGlobalHotCandidates();
    const result = await recommendHotItems(items);
    return NextResponse.json({ ...result, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "刷新推荐失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
