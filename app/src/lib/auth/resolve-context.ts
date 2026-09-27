import {
  AmbiguousTenantError,
  NoMembershipError,
  TenantInactiveError,
  UnauthenticatedError,
} from "./errors";
import type { AuthUser, Membership, MembershipRepository } from "./types";

// Sem "server-only" de propósito: este módulo não toca Supabase/secret
// nenhum (recebe tudo injetado via MembershipRepository) e precisa ser
// importável pelos testes (tests/lib/auth/), que rodam em Node puro sem
// o bundler do Next — "server-only" lança erro nesse caso mesmo fora de
// um Client Component. Quem tem o guard é session.ts e
// supabase-membership-repository.ts (esses sim tocam Supabase/cookies).

export interface AuthContext {
  user: AuthUser;
  membership: Membership;
}

const INACTIVE_STATUSES = new Set(["SUSPENDED", "CANCELLED"]);

/**
 * Resolve o contexto de autorização completo: usuário -> membership ->
 * tenant -> role. É a única função que decide isso — session.ts (o
 * adaptador Next.js/Supabase) só monta os parâmetros e chama esta.
 *
 * Passos (CLAUDE.md / instrução da ETAPA 04):
 * 1. usuário autenticado          -> user === null lança primeiro, antes
 *                                     de qualquer consulta de membership
 * 2. localizar membership          -> repo.findActiveMembership(...)
 * 3. identificar tenant             -> membership.tenant (join, não uma
 *                                     segunda decisão separada)
 * 4. validar status do tenant       -> INACTIVE_STATUSES abaixo
 * 5. identificar role                -> membership.role
 * 6. impedir acesso sem membership   -> todo caminho sem membership válida
 *                                       lança, nunca retorna undefined/null
 *
 * `tenantIdHint` nunca é aceito como verdade — é só um palpite de qual
 * tenant o client quer ver (cookie/URL). A única coisa que decide se o
 * usuário pode agir naquele tenant é o resultado de
 * `repo.findActiveMembership`, consultado pelo `user.id` já autenticado.
 * Um hint que não bate com nenhuma membership real é rejeitado (nunca
 * cai para "usa outro tenant do usuário" por engano, e nunca revela se o
 * tenant do hint sequer existe).
 */
export async function resolveAuthContext(params: {
  user: AuthUser | null;
  tenantIdHint: string | null;
  repo: MembershipRepository;
}): Promise<AuthContext> {
  const { user, tenantIdHint, repo } = params;

  if (!user) {
    throw new UnauthenticatedError();
  }

  const membership = tenantIdHint
    ? await resolveByHint(user.id, tenantIdHint, repo)
    : await resolveWithoutHint(user.id, repo);

  if (INACTIVE_STATUSES.has(membership.tenant.status)) {
    throw new TenantInactiveError(membership.tenant.status);
  }

  return { user, membership };
}

async function resolveByHint(
  userId: string,
  tenantId: string,
  repo: MembershipRepository,
): Promise<Membership> {
  const membership = await repo.findActiveMembership(userId, tenantId);
  if (!membership) {
    throw new NoMembershipError(tenantId);
  }
  return membership;
}

async function resolveWithoutHint(
  userId: string,
  repo: MembershipRepository,
): Promise<Membership> {
  const memberships = await repo.findActiveMembershipsByUser(userId);

  if (memberships.length === 0) {
    throw new NoMembershipError();
  }
  if (memberships.length > 1) {
    throw new AmbiguousTenantError(memberships.map((m) => m.tenantId));
  }
  return memberships[0];
}
