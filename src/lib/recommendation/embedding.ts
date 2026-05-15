import {
  readEmbeddingCache,
  writeEmbeddingCache,
} from "@/lib/server-data/interest-store";
import { normalizeText, textKey } from "@/lib/recommendation/text";

const SILICONFLOW_EMBEDDINGS_URL = "https://api.siliconflow.cn/v1/embeddings";
const DEFAULT_MODEL = "Pro/BAAI/bge-m3";

interface SiliconFlowEmbeddingResponse {
  data?: Array<{ embedding: number[]; index: number }>;
  error?: { message?: string };
}

async function requestEmbedding(input: string): Promise<number[]> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    throw new Error("未配置 SILICONFLOW_API_KEY");
  }

  const res = await fetch(SILICONFLOW_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL || DEFAULT_MODEL,
      input,
      encoding_format: "float",
    }),
  });

  const json = (await res.json()) as SiliconFlowEmbeddingResponse;
  if (!res.ok) {
    throw new Error(json.error?.message ?? "硅基流动 embedding 请求失败");
  }

  const embedding = json.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("硅基流动未返回 embedding");
  }
  return embedding;
}

export async function getEmbedding(text: string) {
  const normalized = normalizeText(text);
  const key = textKey(normalized);
  const cache = await readEmbeddingCache();
  if (cache[key]) {
    return { key, embedding: cache[key] };
  }

  const embedding = await requestEmbedding(normalized);
  cache[key] = embedding;
  await writeEmbeddingCache(cache);
  return { key, embedding };
}
