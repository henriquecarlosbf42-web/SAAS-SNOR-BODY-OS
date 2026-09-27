import { z } from "zod";

/**
 * Variáveis PUBLIC — prefixo NEXT_PUBLIC_, o Next.js as embute no bundle do
 * client. Importável por Client Components. Só o que é seguro de qualquer
 * usuário ver no DevTools entra aqui — nunca um secret, mesmo que pareça
 * inofensivo.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
  // Usada pra montar o redirect de confirmação de email / reset de senha
  // (supabase.auth.signUp / resetPasswordForEmail) — precisa apontar pro
  // domínio de verdade em produção, não pra localhost.
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const result = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!result.success) {
  const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Variáveis de ambiente públicas inválidas ou ausentes: ${missing}`);
}

export const publicEnv = result.data;
