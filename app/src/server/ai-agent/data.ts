import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/config/env.public";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AiAgentConfiguration, AiAgentPromptContext } from "@/lib/domains/ai-agent";

type AiAgentRow = {
  id: string;
  name: string;
  tone: string;
  language: string;
  business_description: string;
  services: string[];
  business_hours: string;
  service_area: string;
  enabled: boolean;
};

type AiInstructionRow = {
  kind: "INSTRUCTIONS" | "KNOWLEDGE";
  content: string;
};

type DbResult = { ok: true } | { ok: false; code: string };
type AiReplyResult = { ok: true; replySaved: boolean } | { ok: false; code: string };
type CustomerMessageResult =
  { ok: true; status: "OPEN" | "AI_ACTIVE" | "HUMAN_ACTIVE" } | { ok: false; code: string };

function reportDatabaseError(operation: string, code: string): void {
  console.error(`[ai-agent] ${operation} failed`, { code });
}

export async function getAiAgentConfiguration(tenantId: string): Promise<{
  id: string;
  configuration: AiAgentConfiguration;
  businessHours: string;
  serviceArea: string;
} | null> {
  const supabase = await createServerSupabaseClient();
  const { data: agentData, error: agentError } = await supabase
    .from("ai_agents")
    .select(
      "id, name, tone, language, business_description, services, business_hours, service_area, enabled",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (agentError) {
    reportDatabaseError("load configuration", agentError.code);
    throw new Error("Could not load the AI agent configuration.");
  }
  if (!agentData) return null;

  const { data: instructionData, error: instructionError } = await supabase
    .from("ai_agent_instructions")
    .select("kind, content")
    .eq("tenant_id", tenantId)
    .eq("ai_agent_id", agentData.id);

  if (instructionError) {
    reportDatabaseError("load instructions", instructionError.code);
    throw new Error("Could not load the AI agent instructions.");
  }

  const agent = agentData as AiAgentRow;
  const instructions = new Map(
    ((instructionData ?? []) as AiInstructionRow[]).map(({ kind, content }) => [kind, content]),
  );
  return {
    id: agent.id,
    configuration: {
      name: agent.name,
      tone: agent.tone,
      language: agent.language,
      businessDescription: agent.business_description,
      servicesText: agent.services,
      businessHours: agent.business_hours,
      serviceArea: agent.service_area,
      instructions: instructions.get("INSTRUCTIONS") ?? "",
      knowledge: instructions.get("KNOWLEDGE") ?? "",
      enabled: agent.enabled,
    },
    businessHours: agent.business_hours,
    serviceArea: agent.service_area,
  };
}

export async function saveAiAgentConfiguration(
  tenantId: string,
  values: AiAgentConfiguration,
): Promise<DbResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("save_ai_agent_configuration", {
    p_tenant_id: tenantId,
    p_name: values.name,
    p_tone: values.tone,
    p_language: values.language,
    p_business_description: values.businessDescription,
    p_services: values.servicesText,
    p_business_hours: values.businessHours,
    p_service_area: values.serviceArea,
    p_enabled: values.enabled,
    p_instructions: values.instructions,
    p_knowledge: values.knowledge,
  });
  if (error) {
    reportDatabaseError("save configuration", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}

export async function setConversationAIActive(conversationId: string): Promise<DbResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_conversation_ai_active", {
    p_conversation_id: conversationId,
  });
  if (error) {
    reportDatabaseError("activate AI", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}

export async function recordCustomerMessage(
  tenantId: string,
  conversationId: string,
  content: string,
): Promise<CustomerMessageResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("record_customer_message", {
    p_tenant_id: tenantId,
    p_conversation_id: conversationId,
    p_content: content,
  });
  if (error) {
    reportDatabaseError("record customer message", error.code);
    return { ok: false, code: error.code };
  }
  if (data !== "OPEN" && data !== "AI_ACTIVE" && data !== "HUMAN_ACTIVE") {
    reportDatabaseError("record customer message", "INVALID_STATUS");
    return { ok: false, code: "INVALID_STATUS" };
  }
  return { ok: true, status: data };
}

export async function loadAiPromptContext(
  tenantId: string,
  conversationId: string,
): Promise<{
  agentId: string;
  configuration: AiAgentPromptContext;
  instructions: string;
  knowledge: string;
  history: { sender: "customer" | "agent"; content: string }[];
} | null> {
  const supabase = await createServerSupabaseClient();
  const { data: conversationData, error: conversationError } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    reportDatabaseError("load conversation context", conversationError.code);
    throw new Error("Could not load the AI conversation context.");
  }
  if (!conversationData || conversationData.status !== "AI_ACTIVE") return null;

  const [agentData, instructionResult, historyResult] = await Promise.all([
    supabase
      .from("ai_agents")
      .select(
        "id, name, tone, language, business_description, services, business_hours, service_area, enabled",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase.from("ai_agent_instructions").select("kind, content").eq("tenant_id", tenantId),
    supabase
      .from("messages")
      .select("sender_type, content, created_at")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (agentData.error) {
    reportDatabaseError("load prompt agent", agentData.error.code);
    throw new Error("Could not load the AI prompt data.");
  }
  if (instructionResult.error) {
    reportDatabaseError("load prompt instructions", instructionResult.error.code);
    throw new Error("Could not load the AI prompt data.");
  }
  if (historyResult.error) {
    reportDatabaseError("load prompt history", historyResult.error.code);
    throw new Error("Could not load the AI prompt data.");
  }

  if (!agentData.data?.enabled) return null;
  const agent = agentData.data as AiAgentRow;
  const instructions = new Map(
    ((instructionResult.data ?? []) as AiInstructionRow[]).map(({ kind, content }) => [
      kind,
      content,
    ]),
  );
  const messages = historyResult.data ?? [];

  return {
    agentId: agent.id,
    configuration: {
      name: agent.name,
      tone: agent.tone,
      language: agent.language,
      businessDescription: agent.business_description,
      services: agent.services,
      businessHours: agent.business_hours,
      serviceArea: agent.service_area,
    },
    instructions: instructions.get("INSTRUCTIONS") ?? "",
    knowledge: instructions.get("KNOWLEDGE") ?? "",
    history: messages
      .reverse()
      .filter(
        (message) =>
          message.sender_type === "LEAD" ||
          message.sender_type === "AGENT" ||
          message.sender_type === "SYSTEM",
      )
      .map((message) => ({
        sender: message.sender_type === "LEAD" ? "customer" : "agent",
        content: message.content,
      })),
  };
}

export async function saveAiReplyAndUsage(
  tenantId: string,
  conversationId: string,
  actorId: string,
  response: {
    content: string;
    model: string;
    responseId: string;
    promptTokens: number;
    completionTokens: number;
  },
): Promise<AiReplyResult> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY_MISSING");

  const supabase = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.rpc("save_ai_agent_reply_with_usage", {
    p_tenant_id: tenantId,
    p_conversation_id: conversationId,
    p_actor_id: actorId,
    p_content: response.content,
    p_model: response.model,
    p_response_id: response.responseId,
    p_prompt_tokens: response.promptTokens,
    p_completion_tokens: response.completionTokens,
  });
  if (error) {
    reportDatabaseError("save response and usage", error.code);
    return { ok: false, code: error.code };
  }
  if (typeof data !== "boolean")
    throw new Error("Could not confirm whether the AI reply was saved.");
  return { ok: true, replySaved: data };
}

export function isAiReplyPersistenceConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
