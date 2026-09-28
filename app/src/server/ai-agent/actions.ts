"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth/session";
import { aiAgentConfigurationSchema } from "@/lib/domains/ai-agent";
import { conversationIdSchema, messageSchema } from "@/lib/domains/conversations";
import { isOpenAIConfigured } from "@/services/openai";
import {
  isAiReplyPersistenceConfigured,
  recordCustomerMessage,
  saveAiAgentConfiguration,
  setConversationAIActive,
} from "./data";
import { OpenAIServiceError } from "@/services/openai";
import { respondToAiConversation } from "./respond";

export type AiAgentActionResult = { error: string } | { success: true; notice?: string };

function formValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function validationError(error: z.ZodError): AiAgentActionResult {
  return { error: error.issues[0]?.message ?? "Check the information and try again." };
}

export async function saveAiAgentSettings(formData: FormData): Promise<AiAgentActionResult> {
  try {
    await requirePermission("configuracoes:write");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You don't have permission to manage the AI agent." };
    }
    throw error;
  }

  const parsed = aiAgentConfigurationSchema.safeParse({
    name: formValue(formData, "name"),
    tone: formValue(formData, "tone"),
    language: formValue(formData, "language"),
    businessDescription: formValue(formData, "businessDescription"),
    servicesText: formValue(formData, "servicesText"),
    businessHours: formValue(formData, "businessHours"),
    serviceArea: formValue(formData, "serviceArea"),
    instructions: formValue(formData, "instructions"),
    knowledge: formValue(formData, "knowledge"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return validationError(parsed.error);

  const tenant = await getCurrentTenant();
  const result = await saveAiAgentConfiguration(tenant.id, parsed.data);
  if (!result.ok) return { error: "We couldn't save the AI agent settings. Please try again." };

  revalidatePath("/settings/ai-agent");
  revalidatePath("/inbox");
  return { success: true };
}

export async function activateAiForConversation(
  conversationId: string,
): Promise<AiAgentActionResult> {
  try {
    await requirePermission("conversations:write");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You don't have permission to activate the AI agent." };
    }
    throw error;
  }

  const parsed = conversationIdSchema.safeParse(conversationId);
  if (!parsed.success) return { error: "This conversation could not be found." };
  if (!isOpenAIConfigured() || !isAiReplyPersistenceConfigured()) {
    return {
      error:
        "Configure OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY on the server before activating AI.",
    };
  }

  const result = await setConversationAIActive(parsed.data);
  if (!result.ok) return { error: "Enable the AI agent in settings before activating it here." };

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data}`);
  return { success: true };
}

export async function receiveCustomerMessage(formData: FormData): Promise<AiAgentActionResult> {
  try {
    await requirePermission("conversations:write");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You don't have permission to add a customer message." };
    }
    throw error;
  }

  const parsed = messageSchema.safeParse({
    conversationId: formValue(formData, "conversationId"),
    content: formValue(formData, "content"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()]);
  if (!user) return { error: "Your session has expired. Sign in again." };
  const recorded = await recordCustomerMessage(
    tenant.id,
    parsed.data.conversationId,
    parsed.data.content,
  );
  if (!recorded.ok) {
    return {
      error: "We couldn't record this customer message. Check the conversation and try again.",
    };
  }

  if (recorded.status === "AI_ACTIVE") {
    try {
      const result = await respondToAiConversation(tenant.id, parsed.data.conversationId, user.id);
      if (!result.ok && result.code !== "AI_NOT_ACTIVE") {
        throw new Error("AI_REPLY_NOT_SAVED");
      }
      if (result.ok && !result.replySaved) {
        revalidatePath("/inbox");
        revalidatePath(`/inbox/${parsed.data.conversationId}`);
        return {
          success: true,
          notice:
            "Customer message recorded. AI did not reply because the conversation changed state.",
        };
      }
    } catch (error) {
      const reason =
        error instanceof OpenAIServiceError && error.code === "MISSING_API_KEY"
          ? "The customer message was saved, but OPENAI_API_KEY is not configured on the server."
          : "The customer message was saved, but the AI could not reply. Take over the conversation or try again.";
      console.error("[ai-agent] response failed", {
        tenantId: tenant.id,
        conversationId: parsed.data.conversationId,
        code: error instanceof OpenAIServiceError ? error.code : "AI_PROCESSING_FAILED",
      });
      revalidatePath("/inbox");
      revalidatePath(`/inbox/${parsed.data.conversationId}`);
      return { error: reason };
    }
  }

  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data.conversationId}`);
  return { success: true };
}
