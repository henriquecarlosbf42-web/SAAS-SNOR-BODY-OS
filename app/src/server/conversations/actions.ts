"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth/session";
import {
  assignAgentSchema,
  conversationIdSchema,
  conversationStatusActionSchema,
  createLeadConversationSchema,
  messageSchema,
} from "@/lib/domains/conversations";
import {
  assignConversation as assignConversationRecord,
  createLeadConversation as createLeadConversationRecord,
  markConversationRead as markConversationReadRecord,
  sendAgentMessage as sendAgentMessageRecord,
  takeOverConversation as takeOverConversationRecord,
  updateConversationStatus as updateConversationStatusRecord,
} from "./data";

export type ConversationActionResult = { error: string } | { success: true; id?: string };

function formValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

async function permissionError(permission: "conversations:read" | "conversations:write") {
  try {
    await requirePermission(permission);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You don't have permission to access this conversation." };
    }
    throw error;
  }
}

function validationError(error: z.ZodError): ConversationActionResult {
  return { error: error.issues[0]?.message ?? "Check the information and try again." };
}

function mutationError(): ConversationActionResult {
  return { error: "We couldn't update this conversation. Refresh and try again." };
}

function notFoundError(): ConversationActionResult {
  return { error: "This conversation could not be found or is no longer available." };
}

export async function createLeadConversation(
  formData: FormData,
): Promise<ConversationActionResult> {
  const denied = await permissionError("conversations:write");
  if (denied) return denied;

  const parsed = createLeadConversationSchema.safeParse({
    name: formValue(formData, "name"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const result = await createLeadConversationRecord(tenant.id, parsed.data);
  if (!result.ok) return mutationError();

  revalidatePath("/inbox");
  return { success: true, id: result.id };
}

export async function sendAgentMessage(formData: FormData): Promise<ConversationActionResult> {
  const denied = await permissionError("conversations:write");
  if (denied) return denied;

  const parsed = messageSchema.safeParse({
    conversationId: formValue(formData, "conversationId"),
    content: formValue(formData, "content"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
  if (!user) return { error: "Your session has expired. Sign in again." };

  const result = await sendAgentMessageRecord(
    tenant.id,
    parsed.data.conversationId,
    user.id,
    parsed.data.content,
  );
  if (!result.ok) return mutationError();

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data.conversationId}`);
  return { success: true };
}

export async function assignConversation(formData: FormData): Promise<ConversationActionResult> {
  const denied = await permissionError("conversations:write");
  if (denied) return denied;

  const parsed = assignAgentSchema.safeParse({
    conversationId: formValue(formData, "conversationId"),
    agentId: formValue(formData, "agentId"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const result = await assignConversationRecord(parsed.data.conversationId, parsed.data.agentId);
  if (!result.ok) return notFoundError();

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data.conversationId}`);
  return { success: true };
}

export async function takeOverConversation(formData: FormData): Promise<ConversationActionResult> {
  const denied = await permissionError("conversations:write");
  if (denied) return denied;

  const parsed = conversationIdSchema.safeParse(formValue(formData, "conversationId"));
  if (!parsed.success) return notFoundError();

  const result = await takeOverConversationRecord(parsed.data);
  if (!result.ok) return notFoundError();

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data}`);
  return { success: true };
}

export async function changeConversationStatus(
  formData: FormData,
): Promise<ConversationActionResult> {
  const denied = await permissionError("conversations:write");
  if (denied) return denied;

  const parsed = conversationStatusActionSchema.safeParse({
    conversationId: formValue(formData, "conversationId"),
    status: formValue(formData, "status"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const result = await updateConversationStatusRecord(
    parsed.data.conversationId,
    parsed.data.status,
  );
  if (!result.ok) return notFoundError();

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data.conversationId}`);
  return { success: true };
}

export async function markConversationRead(
  conversationId: string,
): Promise<ConversationActionResult> {
  const denied = await permissionError("conversations:read");
  if (denied) return denied;

  const parsed = conversationIdSchema.safeParse(conversationId);
  if (!parsed.success) return notFoundError();

  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
  if (!user) return { error: "Your session has expired. Sign in again." };

  const result = await markConversationReadRecord(tenant.id, parsed.data, user.id);
  return result.ok ? { success: true } : notFoundError();
}
