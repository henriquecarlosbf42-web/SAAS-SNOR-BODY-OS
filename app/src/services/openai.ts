import "server-only";
import { z } from "zod";
import type { AiAgentPromptMessage } from "@/lib/domains/ai-agent";

const completionSchema = z.object({
  id: z.string().min(1),
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().nullable() }),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
  }),
});

export class OpenAIServiceError extends Error {
  constructor(
    public readonly code:
      "MISSING_API_KEY" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_REJECTED" | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function createChatCompletion(messages: AiAgentPromptMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAIServiceError("MISSING_API_KEY");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_completion_tokens: 1000,
        temperature: 0.3,
      }),
    });
  } catch {
    throw new OpenAIServiceError("UPSTREAM_UNAVAILABLE");
  }

  if (!response.ok) throw new OpenAIServiceError("UPSTREAM_REJECTED");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OpenAIServiceError("INVALID_RESPONSE");
  }

  const parsed = completionSchema.safeParse(payload);
  const content = parsed.success ? parsed.data.choices[0]?.message.content?.trim() : null;
  if (!parsed.success || !content || content.length > 10000) {
    throw new OpenAIServiceError("INVALID_RESPONSE");
  }

  return {
    content,
    responseId: parsed.data.id,
    promptTokens: parsed.data.usage.prompt_tokens,
    completionTokens: parsed.data.usage.completion_tokens,
    model: "gpt-4o-mini",
  };
}
