import { z } from "zod";

export const conversationStatusSchema = z.enum(["OPEN", "AI_ACTIVE", "HUMAN_ACTIVE", "CLOSED"]);

export const createLeadConversationSchema = z.object({
  name: z.string().trim().min(1, "Lead name is required").max(200),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.union([z.string().trim().email().max(320), z.null()]),
  ),
  phone: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(40).nullable(),
  ),
});

export const conversationIdSchema = z.string().uuid();
export const assignAgentSchema = z.object({
  conversationId: conversationIdSchema,
  agentId: z.string().uuid(),
});
export const messageSchema = z.object({
  conversationId: conversationIdSchema,
  content: z.string().trim().min(1, "Message cannot be empty").max(10000),
});
export const conversationStatusActionSchema = z.object({
  conversationId: conversationIdSchema,
  status: z.enum(["OPEN", "CLOSED"]),
});

export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export interface ConversationListItem {
  id: string;
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  assignedTo: string | null;
  assignedAgentName: string | null;
  status: ConversationStatus;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationAgent {
  userId: string;
  name: string;
  role: string;
}

export interface ConversationMessage {
  id: string;
  senderType: "LEAD" | "AGENT" | "SYSTEM";
  senderUserId: string | null;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface ConversationDetail extends ConversationListItem {
  messages: ConversationMessage[];
}
