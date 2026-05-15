import { NextResponse } from "next/server";
import { REBANG_FETCH_HEADERS } from "@/lib/rebang/api";

const CDN_BASE = "https://cdn.rebang.today";
const IMG_BASE = "https://img.rebang.today";

export const dynamic = "force-dynamic";

function placeholderSvg(label: string): Response {
  const char = (label?.[0] ?? "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#6366f1"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14" font-family="system-ui,sans-serif">${char}</text></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const kind = searchParams.get("kind") ?? "cdn";
  const label = searchParams.get("label") ?? "";

  if (!path || path.includes("..")) {
    return placeholderSvg(label);
  }

  const candidates: string[] = [];
  if (path.startsWith("http://") || path.startsWith("https://")) {
    candidates.push(path);
  } else {
    const clean = path.replace(/^\//, "");
    candidates.push(`${CDN_BASE}/${clean}`);
    if (kind === "img") {
      candidates.push(`${IMG_BASE}/${clean}`);
    }
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          ...REBANG_FETCH_HEADERS,
          Accept: "image/*,*/*",
        },
        cache: "no-store",
      });

      if (!res.ok) continue;

      const bytes = await res.arrayBuffer();
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "image/png",
          "Cache-Control":
            "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      continue;
    }
  }

  return placeholderSvg(label);
}
