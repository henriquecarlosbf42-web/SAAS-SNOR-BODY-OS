import { describe, expect, it } from "vitest";
import { resolveAuthContext } from "@/lib/auth/resolve-context";
import {
  AmbiguousTenantError,
  NoMembershipError,
  TenantInactiveError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import type { AuthUser, Membership } from "@/lib/auth/types";
import { FakeMembershipRepository } from "./fake-membership-repository";

const tenantA = { id: "tenant-a", name: "Oficina A", slug: "oficina-a", status: "ACTIVE" as const };
const tenantB = { id: "tenant-b", name: "Oficina B", slug: "oficina-b", status: "ACTIVE" as const };
const tenantSuspenso = {
  id: "tenant-susp",
  name: "Oficina Suspensa",
  slug: "oficina-suspensa",
  status: "SUSPENDED" as const,
};

const userA: AuthUser = { id: "user-a", email: "dono-a@example.com" };
const userB: AuthUser = { id: "user-b", email: "dono-b@example.com" };
const userMulti: AuthUser = { id: "user-multi", email: "consultor@example.com" };
const userSemMembership: AuthUser = { id: "user-sem-membership", email: "novo@example.com" };
const userTenantSuspenso: AuthUser = { id: "user-susp", email: "dono-susp@example.com" };

const membershipA: Membership = {
  id: "m-a",
  tenantId: tenantA.id,
  userId: userA.id,
  role: "OWNER",
  isActive: true,
  tenant: tenantA,
};
const membershipB: Membership = {
  id: "m-b",
  tenantId: tenantB.id,
  userId: userB.id,
  role: "OWNER",
  isActive: true,
  tenant: tenantB,
};
const membershipMultiA: Membership = {
  id: "m-multi-a",
  tenantId: tenantA.id,
  userId: userMulti.id,
  role: "VIEWER",
  isActive: true,
  tenant: tenantA,
};
const membershipMultiB: Membership = {
  id: "m-multi-b",
  tenantId: tenantB.id,
  userId: userMulti.id,
  role: "VIEWER",
  isActive: true,
  tenant: tenantB,
};
const membershipSuspensa: Membership = {
  id: "m-susp",
  tenantId: tenantSuspenso.id,
  userId: userTenantSuspenso.id,
  role: "OWNER",
  isActive: true,
  tenant: tenantSuspenso,
};

function buildRepo() {
  return new FakeMembershipRepository([
    membershipA,
    membershipB,
    membershipMultiA,
    membershipMultiB,
    membershipSuspensa,
  ]);
}

describe("resolveAuthContext — ETAPA 04, núcleo de multi-tenancy", () => {
  it("Tenant A acessa seus dados", async () => {
    const repo = buildRepo();
    const ctx = await resolveAuthContext({ user: userA, tenantIdHint: null, repo });

    expect(ctx.membership.tenantId).toBe(tenantA.id);
    expect(ctx.membership.tenant.slug).toBe("oficina-a");
    expect(ctx.membership.role).toBe("OWNER");
  });

  it("Tenant B acessa seus dados", async () => {
    const repo = buildRepo();
    const ctx = await resolveAuthContext({ user: userB, tenantIdHint: null, repo });

    expect(ctx.membership.tenantId).toBe(tenantB.id);
    expect(ctx.membership.tenant.slug).toBe("oficina-b");
  });

  it("Usuário A tentando acessar Tenant B — negado, mesmo os dois tenants existindo de verdade", async () => {
    const repo = buildRepo();

    await expect(
      resolveAuthContext({ user: userA, tenantIdHint: tenantB.id, repo }),
    ).rejects.toBeInstanceOf(NoMembershipError);
  });

  it("Usuário sem membership — negado", async () => {
    const repo = buildRepo();

    await expect(
      resolveAuthContext({ user: userSemMembership, tenantIdHint: null, repo }),
    ).rejects.toBeInstanceOf(NoMembershipError);
  });

  it("Usuário não autenticado — negado antes de qualquer consulta de membership", async () => {
    const repo = buildRepo();

    await expect(
      resolveAuthContext({ user: null, tenantIdHint: "tenant-qualquer", repo }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    // Passo 1 (identificar usuário) barra antes do passo 2 (localizar
    // membership) — o repositório nunca deveria ter sido consultado.
    expect(repo.calls).toHaveLength(0);
  });

  it("Tentativa de manipular tenant_id — hint trocado por um tenant real de outro usuário é rejeitado", async () => {
    const repo = buildRepo();

    // userA é dono só do tenant A; alguém adulterou o cookie/param pra
    // apontar pro tenant B (que existe de verdade, não é um id inválido).
    await expect(
      resolveAuthContext({ user: userA, tenantIdHint: tenantB.id, repo }),
    ).rejects.toBeInstanceOf(NoMembershipError);

    // E pra um tenant que nem existe, o resultado é o mesmo erro — nunca
    // vaza se o tenant existe ou não (evita virar oráculo de enumeração).
    await expect(
      resolveAuthContext({ user: userA, tenantIdHint: "tenant-inexistente", repo }),
    ).rejects.toBeInstanceOf(NoMembershipError);
  });

  it("suporta um usuário -> múltiplos tenants: com hint correto, resolve o tenant pedido", async () => {
    const repo = buildRepo();

    const ctxA = await resolveAuthContext({ user: userMulti, tenantIdHint: tenantA.id, repo });
    expect(ctxA.membership.tenantId).toBe(tenantA.id);

    const ctxB = await resolveAuthContext({ user: userMulti, tenantIdHint: tenantB.id, repo });
    expect(ctxB.membership.tenantId).toBe(tenantB.id);
  });

  it("usuário com múltiplos tenants e SEM hint: ambíguo, não escolhe um por adivinhação", async () => {
    const repo = buildRepo();

    await expect(
      resolveAuthContext({ user: userMulti, tenantIdHint: null, repo }),
    ).rejects.toBeInstanceOf(AmbiguousTenantError);
  });

  it("valida status do tenant: tenant suspenso bloqueia acesso mesmo com membership válida", async () => {
    const repo = buildRepo();

    await expect(
      resolveAuthContext({ user: userTenantSuspenso, tenantIdHint: null, repo }),
    ).rejects.toBeInstanceOf(TenantInactiveError);
  });
});
