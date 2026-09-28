import "server-only";
import { buildProtectedPrompt } from "@/lib/domains/ai-agent";
import { createChatCompletion } from "@/services/openai";
import { loadAiPromptContext, saveAiReplyAndUsage } from "./data";

export async function respondToAiConversation(
  tenantId: string,
  conversationId: string,
  actorId: string,
) {
  const context = await loadAiPromptContext(tenantId, conversationId);
  if (!context) return { ok: false as const, code: "AI_NOT_ACTIVE" };

  const prompt = buildProtectedPrompt(
    context.configuration,
    context.instructions,
    context.knowledge,
    context.history,
  );
  const completion = await createChatCompletion(prompt);
  const result = await saveAiReplyAndUsage(tenantId, conversationId, actorId, completion);
  if (!result.ok) return result;

  return { ok: true as const, replySaved: result.replySaved };
}
