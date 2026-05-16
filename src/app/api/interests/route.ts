import { NextResponse } from "next/server";
import { addInterestFeedback } from "@/lib/recommendation/hot-recommend";
import { readInterests } from "@/lib/server-data/interest-store";
import type { InterestKind } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const interests = await readInterests();
  const stats = {
    total: interests.length,
    positive: interests.filter((i) => i.kind === "positive").length,
    negative: interests.filter((i) => i.kind === "negative").length,
    readLater: interests.filter((i) => i.kind === "read_later").length,
    updatedAt:
      interests
        .map((i) => i.updatedAt)
        .sort()
        .at(-1) ?? null,
  };
  return NextResponse.json({ interests, stats });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      item?: Parameters<typeof addInterestFeedback>[0];
      kind?: InterestKind;
    };
    if (!body.item || !body.kind) {
      return NextResponse.json({ error: "缺少兴趣反馈参数" }, { status: 400 });
    }
    await addInterestFeedback(body.item, body.kind);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存兴趣失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
