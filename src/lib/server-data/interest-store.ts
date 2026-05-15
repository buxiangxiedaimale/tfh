import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InterestItem } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const INTERESTS_FILE = path.join(DATA_DIR, "interests.json");
const INTERESTS_TEMP = path.join(DATA_DIR, "interests.json.tmp");
const EMBEDDINGS_FILE = path.join(DATA_DIR, "embedding-cache.json");
const EMBEDDINGS_TEMP = path.join(DATA_DIR, "embedding-cache.json.tmp");

export type EmbeddingCache = Record<string, number[]>;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return fallback;
    }
    throw error;
  }
}

async function writeJson<T>(file: string, temp: string, data: T) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await rename(temp, file);
}

export function readInterests() {
  return readJson<InterestItem[]>(INTERESTS_FILE, []);
}

export function writeInterests(items: InterestItem[]) {
  return writeJson(INTERESTS_FILE, INTERESTS_TEMP, items);
}

export function readEmbeddingCache() {
  return readJson<EmbeddingCache>(EMBEDDINGS_FILE, {});
}

export function writeEmbeddingCache(cache: EmbeddingCache) {
  return writeJson(EMBEDDINGS_FILE, EMBEDDINGS_TEMP, cache);
}
