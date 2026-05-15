import { NextResponse } from "next/server";
import {
  addInterestFeedback,
  buildInterestProfile,
} from "@/lib/recommendation/hot-recommend";
import { readInterests } from "@/lib/server-data/interest-store";
import type { InterestKind } from "@/types";

export const runtime = "nodejs";

export async function GET() {
  const interests = await readInterests();
  return NextResponse.json({
    interests,
    profile: buildInterestProfile(interests),
  });
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
