import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { mergePayload } from "@/lib/sync/merge";
import type { SyncPayload } from "@/types";

const TABLE = "workspace_snapshots";

export async function pullSnapshot(
  workspaceId: string
): Promise<SyncPayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("payload, version, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("Failed to pull sync snapshot", error);
    return null;
  }
  if (!data) return null;
  return data.payload as SyncPayload;
}

export async function pushSnapshot(
  workspaceId: string,
  payload: SyncPayload
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.from(TABLE).upsert(
    {
      workspace_id: workspaceId,
      payload,
      version: payload.version,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" }
  );

  if (error) {
    console.error("Failed to push sync snapshot", error);
    return false;
  }
  return true;
}

export function subscribeSnapshot(
  workspaceId: string,
  onRemote: (payload: SyncPayload) => void
): (() => void) | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  const channel = supabase
    .channel(`workspace:${workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        const row = payload.new as {
          payload?: SyncPayload;
        };
        if (row?.payload) onRemote(row.payload);
      }
    )
    .subscribe((status, error) => {
      if (error) console.error("Sync realtime subscription failed", status, error);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export function canSync(): boolean {
  return isSupabaseConfigured();
}

export function mergeRemote(
  local: SyncPayload,
  remote: SyncPayload
): SyncPayload {
  return mergePayload(local, remote);
}
