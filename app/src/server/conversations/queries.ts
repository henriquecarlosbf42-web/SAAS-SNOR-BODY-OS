import "server-only";
import { notFound } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentRole, getCurrentTenant } from "@/lib/auth/session";
import { conversationIdSchema } from "@/lib/domains/conversations";
import type {
  ConversationAgent,
  ConversationDetail,
  ConversationListItem,
} from "@/lib/domains/conversations";
import { getConversation, listConversationAgents, listConversations } from "./data";
import { isAiAgentEnabled } from "@/server/ai-agent/queries";

async function requireConversationReader() {
  try {
    await requirePermission("conversations:read");
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const [tenant, role] = await Promise.all([getCurrentTenant(), getCurrentRole()]);
  return { tenant, canWrite: can(role, "conversations:write") };
}

export async function getInbox(): Promise<{
  conversations: ConversationListItem[];
  canWrite: boolean;
}> {
  const { tenant, canWrite } = await requireConversationReader();
  const conversations = await listConversations(tenant.id);
  return { conversations, canWrite };
}

export async function getConversationDetails(id: string): Promise<{
  conversation: ConversationDetail;
  agents: ConversationAgent[];
  canWrite: boolean;
  aiEnabled: boolean;
} | null> {
  const parsedId = conversationIdSchema.safeParse(id);
  if (!parsedId.success) return null;

  const { tenant, canWrite } = await requireConversationReader();
  const [conversation, agents] = await Promise.all([
    getConversation(tenant.id, parsedId.data),
    canWrite ? listConversationAgents(tenant.id) : Promise.resolve([]),
  ]);
  if (!conversation) return null;
  const aiEnabled = await isAiAgentEnabled(tenant.id);
  return { conversation, agents, canWrite, aiEnabled };
}
