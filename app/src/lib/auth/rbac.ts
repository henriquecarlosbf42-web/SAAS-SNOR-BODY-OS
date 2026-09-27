import { can, type Permission } from "./permissions";
import { ForbiddenError } from "./errors";
import type { Role } from "./types";

// Sem "server-only" aqui por propósito, mesma razão de resolve-context.ts:
// `assertPermission` é lógica pura (não toca Supabase) e precisa ser
// importável pelos testes em Node puro. `requirePermission` (abaixo, que
// usa getCurrentRole/session.ts) é que carrega a garantia de "server
// only" — ela vem transitivamente de session.ts.

/**
 * Lança `ForbiddenError` se `role` não tem `permission`. Pura — não sabe
 * de sessão, tenant ou Supabase; só aplica `can()`. É o que
 * `requirePermission` (abaixo) e os testes usam.
 */
export function assertPermission(role: string, permission: Permission): asserts role is Role {
  if (!can(role, permission)) {
    throw new ForbiddenError(role, permission);
  }
}

/**
 * Versão pronta pra uso em Server Actions: resolve o papel do usuário
 * atual (autenticação + tenant + membership, tudo de session.ts —
 * ETAPA 04) e então aplica a permissão (ETAPA 06). Lança
 * `UnauthenticatedError`/`NoMembershipError`/`TenantInactiveError` (sem
 * nem chegar a checar permissão) ou `ForbiddenError` (autenticado, no
 * tenant certo, mas sem a permissão pedida).
 */
export async function requirePermission(permission: Permission): Promise<Role> {
  // Import dinâmico evita "server-only" de session.ts vazar pra quem só
  // quer usar assertPermission em teste/Node puro.
  const { getCurrentRole } = await import("./session");
  const role = await getCurrentRole();
  assertPermission(role, permission);
  return role;
}
