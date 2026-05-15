import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SyncPayload } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "flowtodo.json");
const TEMP_FILE = path.join(DATA_DIR, "flowtodo.json.tmp");

export async function readServerPayload(): Promise<SyncPayload | null> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as SyncPayload;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function writeServerPayload(payload: SyncPayload) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TEMP_FILE, JSON.stringify(payload, null, 2), "utf8");
  await rename(TEMP_FILE, DATA_FILE);
}
