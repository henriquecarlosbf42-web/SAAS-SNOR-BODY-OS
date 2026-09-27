"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publicEnv } from "@/config/env.public";

/**
 * Server Actions de autenticação (ETAPA 06). Cada uma segue o esqueleto
 * de ARCHITECTURE.md seção 10: validar input (Zod) antes de qualquer
 * chamada ao Supabase, nunca devolver detalhe interno do erro pro
 * usuário (SECURITY.md seção 5) — a mensagem exata do Supabase fica só
 * em log de servidor.
 *
 * Não há módulo de negócio aqui (CRM/orçamento/ERP) — só o fluxo de
 * conta: cadastro, login, logout, recuperação de senha. RBAC
 * (lib/auth/rbac.ts) não se aplica a essas ações — todo usuário
 * autenticado ou não pode tentar logar; a autorização de negócio começa
 * depois que a sessão existe.
 */

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8, "Senha precisa ter no mínimo 8 caracteres");

export type ActionResult = { error: string } | { success: true };

function genericAuthError(): ActionResult {
  // Mensagem deliberadamente genérica — nunca confirma/nega se um email
  // existe (evita enumeração de conta), nunca expõe o erro real do
  // Supabase (SECURITY.md seção 5).
  return { error: "Não foi possível completar essa ação. Verifique os dados e tente novamente." };
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Supabase manda o email de confirmação com um link pra essa rota
      // (troca o `code` por sessão — src/app/auth/callback/route.ts).
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return genericAuthError();
  }

  return { success: true };
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!parsed.success) {
    return { error: "Email ou senha inválidos" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return genericAuthError();
  }

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Email inválido" };
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  // Sempre "success", exista ou não o email — não dá pra um atacante usar
  // essa tela pra descobrir quais emails têm conta (mesma lógica de
  // genericAuthError, mas aqui o "sucesso" é sempre a resposta certa).
  return { success: true };
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ password: passwordSchema }).safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Senha inválida" };
  }

  const supabase = await createServerSupabaseClient();
  // Só funciona dentro da sessão de recuperação estabelecida pelo link de
  // email (trocada em auth/callback) — sem essa sessão, o Supabase nega.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return genericAuthError();
  }

  redirect("/login");
}

const OAUTH_PROVIDERS = { google: "google", microsoft: "azure" } as const;
export type OAuthProviderKey = keyof typeof OAUTH_PROVIDERS;

/**
 * Preparado pra Google/Microsoft (ARCHITECTURE.md ainda não cobria isso
 * — instrução explícita da ETAPA 06 de "preparar arquitetura"). Código
 * real, não stub: funciona assim que o provider for habilitado no painel
 * do projeto Supabase (nenhuma mudança de código necessária depois).
 * "microsoft" é o nome amigável; o provider do Supabase pra Azure AD
 * chama "azure".
 */
export async function signInWithOAuth(provider: OAuthProviderKey): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: OAUTH_PROVIDERS[provider],
    options: {
      redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return genericAuthError();
  }

  redirect(data.url);
}
