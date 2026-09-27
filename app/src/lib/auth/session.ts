import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveAuthContext } from "./resolve-context";
import { SupabaseMembershipRepository } from "./supabase-membership-repository";
import type { AuthUser, Membership, Role, Tenant } from "./types";

/**
 * Cookie que guarda QUAL tenant o usuário escolheu ver por último —
 * só uma preferência de exibição (ARCHITECTURE.md, "Fluxo de tenant
 * resolution"). Nunca é aceito como autorização: getCurrentMembership()
 * sempre revalida contra tenant_memberships antes de confiar nele.
 */
export const ACTIVE_TENANT_COOKIE = "snor_active_tenant_id";

async function fetchCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabaseClient();
  // getUser() valida o JWT com o servidor do Supabase Auth a cada
  // chamada — não é um simples decode de cookie (que poderia estar
  // adulterado). Nunca trocar por getSession() aqui.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

async function fetchAuthContext() {
  const user = await fetchCurrentUser();
  const tenantIdHint = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value ?? null;
  const supabase = await createServerSupabaseClient();
  const repo = new SupabaseMembershipRepository(supabase);

  return resolveAuthContext({ user, tenantIdHint, repo });
}

// cache() do React deduplica dentro do mesmo request/render (Server
// Components) — evita repetir a mesma consulta várias vezes na mesma
// página. Não é cache entre requests.
const cachedAuthContext = cache(fetchAuthContext);
const cachedCurrentUser = cache(fetchCurrentUser);

/**
 * Usuário autenticado, ou `null` se ninguém logado — única das quatro
 * funções que não lança para esse caso (é a checagem "soft", usada por
 * exemplo pra decidir se mostra link de login ou menu de conta).
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  return cachedCurrentUser();
}

/**
 * Membership ativa do usuário atual no tenant corrente. Lança
 * `UnauthenticatedError` (sem sessão), `NoMembershipError` (autenticado
 * mas sem membership válida — ou hint de tenant que não bate com
 * nenhuma) ou `TenantInactiveError` (tenant suspenso/cancelado).
 */
export async function getCurrentMembership(): Promise<Membership> {
  const ctx = await cachedAuthContext();
  return ctx.membership;
}

/** Tenant do contexto atual — mesmas regras/erros de getCurrentMembership(). */
export async function getCurrentTenant(): Promise<Tenant> {
  const ctx = await cachedAuthContext();
  return ctx.membership.tenant;
}

/** Role do usuário no tenant atual — mesmas regras/erros de getCurrentMembership(). */
export async function getCurrentRole(): Promise<Role> {
  const ctx = await cachedAuthContext();
  return ctx.membership.role;
}

export {
  AmbiguousTenantError,
  NoMembershipError,
  TenantInactiveError,
  UnauthenticatedError,
} from "./errors";
