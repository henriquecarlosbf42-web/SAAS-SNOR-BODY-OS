import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function isAiAgentEnabled(tenantId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[ai-agent] read enabled state failed", { code: error.code });
    throw new Error("Could not load the AI agent state.");
  }
  return data?.enabled ?? false;
}
