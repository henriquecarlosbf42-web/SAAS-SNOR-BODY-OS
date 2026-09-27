import "server-only";
import { z } from "zod";

/**
 * Variáveis SERVER_ONLY / SECRET — o import "server-only" acima quebra o
 * build (erro de compilação, não warning) se qualquer Client Component
 * importar este módulo, direta ou indiretamente. Nunca remover essa linha.
 * Ver DEVELOPMENT.md e SECURITY.md seção 3.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1),
  PADDLE_API_KEY: z.string().min(1),
  PADDLE_WEBHOOK_SECRET: z.string().min(1),
});

const result = serverSchema.safeParse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  PADDLE_API_KEY: process.env.PADDLE_API_KEY,
  PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
});

if (!result.success) {
  // Nunca logar `result.error` inteiro nem os valores — só os nomes que faltam.
  const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Variáveis de ambiente de servidor inválidas ou ausentes: ${missing}`);
}

export const serverEnv = result.data;
