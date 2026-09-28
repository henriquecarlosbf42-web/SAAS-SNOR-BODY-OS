import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ConversationAgent,
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  ConversationStatus,
} from "@/lib/domains/conversations";

type ConversationRow = {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  status: ConversationStatus;
  updated_at: string;
  leads: { name: string; email: string | null; phone: string | null }[];
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_type: "LEAD" | "AGENT" | "SYSTEM";
  sender_user_id: string | null;
  content: string;
  created_at: string;
};

type MessagePreview = Pick<MessageRow, "content" | "created_at">;

type UnreadRow = {
  conversation_id: string;
  unread_count: number;
};

type LatestMessageRow = {
  conversation_id: string;
  content: string;
  created_at: string;
  sender_type: "LEAD" | "AGENT" | "SYSTEM";
  sender_user_id: string | null;
};

type AgentRow = {
  user_id: string;
  full_name: string;
  role: string;
};

type MutationResult = { ok: true } | { ok: false; code: string };

function reportDatabaseError(operation: string, code: string): void {
  console.error(`[conversations] ${operation} failed`, { code });
}

function mapConversation(
  row: ConversationRow,
  agents: Map<string, string>,
  lead: { name: string; email: string | null; phone: string | null },
  lastMessage?: MessagePreview,
  unreadCount = 0,
): ConversationListItem {
  return {
    id: row.id,
    leadId: row.lead_id,
    leadName: lead.name,
    leadEmail: lead.email,
    leadPhone: lead.phone,
    assignedTo: row.assigned_to,
    assignedAgentName: row.assigned_to ? (agents.get(row.assigned_to) ?? null) : null,
    status: row.status,
    lastMessage: lastMessage?.content ?? null,
    lastMessageAt: lastMessage?.created_at ?? row.updated_at,
    unreadCount,
  };
}

async function loadInboxRows(
  tenantId: string,
  conversationId?: string,
): Promise<ConversationRow[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("conversations")
    .select("id, lead_id, assigned_to, status, updated_at, leads!inner(name, email, phone)")
    .eq("tenant_id", tenantId);
  if (conversationId) query = query.eq("id", conversationId);
  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    reportDatabaseError("load inbox", error.code);
    throw new Error("Could not load the inbox.");
  }
  if (!data) throw new Error("Could not load the inbox.");
  return data as ConversationRow[];
}

async function loadLeads(tenantId: string, leadIds: string[]) {
  if (leadIds.length === 0) return new Map<string, ConversationRow["leads"][number]>();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, email, phone")
    .eq("tenant_id", tenantId)
    .in("id", leadIds);

  if (error) {
    reportDatabaseError("load conversation leads", error.code);
    throw new Error("Could not load conversation leads.");
  }

  return new Map(
    (data ?? []).map((lead) => [
      lead.id,
      { name: lead.name, email: lead.email, phone: lead.phone },
    ]),
  );
}

async function loadAgents(tenantId: string): Promise<ConversationAgent[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("list_conversation_agents", {
    p_tenant_id: tenantId,
  });

  if (error) {
    reportDatabaseError("load agents", error.code);
    throw new Error("Could not load conversation agents.");
  }

  return ((data ?? []) as AgentRow[]).map((agent) => ({
    userId: agent.user_id,
    name: agent.full_name,
    role: agent.role,
  }));
}

async function loadUnreadCounts(tenantId: string): Promise<Map<string, number>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("conversation_unread_counts", {
    p_tenant_id: tenantId,
  });

  if (error) {
    reportDatabaseError("load unread counts", error.code);
    throw new Error("Could not load unread conversation counts.");
  }

  return new Map(
    ((data ?? []) as UnreadRow[]).map((item) => [item.conversation_id, Number(item.unread_count)]),
  );
}

async function loadLatestMessages(tenantId: string): Promise<Map<string, MessagePreview>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("conversation_latest_messages", {
    p_tenant_id: tenantId,
  });

  if (error) {
    reportDatabaseError("load latest messages", error.code);
    throw new Error("Could not load inbox message previews.");
  }

  return new Map(
    ((data ?? []) as LatestMessageRow[]).map((message) => [
      message.conversation_id,
      {
        content: message.content,
        created_at: message.created_at,
      },
    ]),
  );
}

export async function listConversations(tenantId: string): Promise<ConversationListItem[]> {
  const rows = await loadInboxRows(tenantId);
  const [agents, unreadCounts, latestMessages, leads] = await Promise.all([
    loadAgents(tenantId),
    loadUnreadCounts(tenantId),
    loadLatestMessages(tenantId),
    loadLeads(
      tenantId,
      rows.map((row) => row.lead_id),
    ),
  ]);
  const agentNames = new Map(agents.map((agent) => [agent.userId, agent.name]));

  return rows.map((row) =>
    mapConversation(
      row,
      agentNames,
      leads.get(row.lead_id) ?? { name: "Unknown lead", email: null, phone: null },
      latestMessages.get(row.id),
      unreadCounts.get(row.id) ?? 0,
    ),
  );
}

export async function getConversation(
  tenantId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const rows = await loadInboxRows(tenantId, conversationId);
  const row = rows[0];
  if (!row) return null;

  const supabase = await createServerSupabaseClient();
  const [agents, unreadCounts, leads, messageResult] = await Promise.all([
    loadAgents(tenantId),
    loadUnreadCounts(tenantId),
    loadLeads(tenantId, [row.lead_id]),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_type, sender_user_id, content, created_at")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);

  if (messageResult.error) {
    reportDatabaseError("load conversation messages", messageResult.error.code);
    throw new Error("Could not load this conversation.");
  }
  const agentNames = new Map(agents.map((agent) => [agent.userId, agent.name]));
  const messageRows = (messageResult.data ?? []) as MessageRow[];
  const lastMessage = messageRows.at(-1);
  const messages: ConversationMessage[] = messageRows.map((message) => ({
    id: message.id,
    senderType: message.sender_type,
    senderUserId: message.sender_user_id,
    senderName:
      message.sender_type === "LEAD"
        ? (leads.get(row.lead_id)?.name ?? "Lead")
        : message.sender_type === "SYSTEM"
          ? "AI Agent"
          : ((message.sender_user_id ? agentNames.get(message.sender_user_id) : null) ??
            "Shop agent"),
    content: message.content,
    createdAt: message.created_at,
  }));

  return {
    ...mapConversation(
      row,
      agentNames,
      leads.get(row.lead_id) ?? { name: "Unknown lead", email: null, phone: null },
      lastMessage,
      unreadCounts.get(row.id) ?? 0,
    ),
    messages,
  };
}

export async function listConversationAgents(tenantId: string): Promise<ConversationAgent[]> {
  return loadAgents(tenantId);
}

export async function createLeadConversation(
  tenantId: string,
  values: { name: string; email: string | null; phone: string | null },
): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_lead_conversation", {
    p_tenant_id: tenantId,
    p_name: values.name,
    p_email: values.email,
    p_phone: values.phone,
  });

  if (error) {
    reportDatabaseError("create lead conversation", error.code);
    return { ok: false, code: error.code };
  }
  if (!data) return { ok: false, code: "NO_ROW_RETURNED" };
  return { ok: true, id: data };
}

export async function sendAgentMessage(
  tenantId: string,
  conversationId: string,
  userId: string,
  content: string,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    sender_type: "AGENT",
    sender_user_id: userId,
    content,
  });

  if (error) {
    reportDatabaseError("send agent message", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}

export async function assignConversation(
  conversationId: string,
  agentId: string,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_conversation_assignee", {
    p_conversation_id: conversationId,
    p_agent_id: agentId,
  });

  if (error) {
    reportDatabaseError("assign conversation", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}

export async function takeOverConversation(conversationId: string): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("take_over_conversation", {
    p_conversation_id: conversationId,
  });

  if (error) {
    reportDatabaseError("take over conversation", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}

export async function updateConversationStatus(
  conversationId: string,
  status: "OPEN" | "CLOSED",
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("change_conversation_status", {
    p_conversation_id: conversationId,
    p_status: status,
  });

  if (error) {
    reportDatabaseError("change conversation status", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}

export async function markConversationRead(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<MutationResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("conversation_participants").upsert(
    {
      tenant_id: tenantId,
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,conversation_id,user_id" },
  );

  if (error) {
    reportDatabaseError("mark conversation read", error.code);
    return { ok: false, code: error.code };
  }
  return { ok: true };
}
