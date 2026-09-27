import { describe, expect, it } from "vitest";
import { resolveAuthContext } from "@/lib/auth/resolve-context";
import { assertPermission } from "@/lib/auth/rbac";
import { UnauthenticatedError, NoMembershipError, ForbiddenError } from "@/lib/auth/errors";
import type { AuthUser, Membership } from "@/lib/auth/types";
import { FakeMembershipRepository } from "./fake-membership-repository";

/**
 * Composição ponta a ponta: resolução de tenant (ETAPA 04) + RBAC
 * (ETAPA 06), do jeito que uma Server Action real usaria (resolve o
 * contexto primeiro, só então checa permissão). Cobre "Tenant A/B" e
 * "usuário sem autenticação" pedidos nesta etapa, mostrando que a
 * ausência de tenant/membership barra ANTES da checagem de permissão —
 * as duas camadas nunca ficam soltas uma da outra.
 */
describe("pipeline de autorização completo (tenant resolution + RBAC)", () => {
  const tenantA = { id: "tenant-a", name: "Oficina A", slug: "oficina-a", status: "ACTIVE" as const };
  const tenantB = { id: "tenant-b", name: "Oficina B", slug: "oficina-b", status: "ACTIVE" as const };

  const ownerA: AuthUser = { id: "user-owner-a", email: "owner-a@example.com" };
  const viewerA: AuthUser = { id: "user-viewer-a", email: "viewer-a@example.com" };

  const membershipOwnerA: Membership = {
    id: "m-owner-a",
    tenantId: tenantA.id,
    userId: ownerA.id,
    role: "OWNER",
    isActive: true,
    tenant: tenantA,
  };
  const membershipViewerA: Membership = {
    id: "m-viewer-a",
    tenantId: tenantA.id,
    userId: viewerA.id,
    role: "VIEWER",
    isActive: true,
    tenant: tenantA,
  };

  function buildRepo() {
    return new FakeMembershipRepository([membershipOwnerA, membershipViewerA]);
  }

  async function authorize(params: {
    user: AuthUser | null;
    tenantIdHint: string | null;
    permission: Parameters<typeof assertPermission>[1];
  }) {
    const repo = buildRepo();
    const ctx = await resolveAuthContext({ user: params.user, tenantIdHint: params.tenantIdHint, repo });
    assertPermission(ctx.membership.role, params.permission);
    return ctx;
  }

  it("Tenant A: OWNER de A consegue escrever em CRM dentro do próprio tenant", async () => {
    const ctx = await authorize({ user: ownerA, tenantIdHint: tenantA.id, permission: "crm:write" });
    expect(ctx.membership.tenantId).toBe(tenantA.id);
  });

  it("Tenant B: usuário sem nenhuma membership em B é barrado antes mesmo do RBAC entrar em jogo", async () => {
    await expect(
      authorize({ user: ownerA, tenantIdHint: tenantB.id, permission: "crm:read" }),
    ).rejects.toBeInstanceOf(NoMembershipError);
  });

  it("usuário sem autenticação é barrado antes de qualquer checagem de permissão", async () => {
    await expect(
      authorize({ user: null, tenantIdHint: tenantA.id, permission: "crm:read" }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("dentro do tenant certo, RBAC ainda barra quem não tem o papel necessário (VIEWER tentando escrever)", async () => {
    await expect(
      authorize({ user: viewerA, tenantIdHint: tenantA.id, permission: "crm:write" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("alteração indevida de role: mesmo autenticado e no tenant certo, só OWNER passa em membros:write", async () => {
    await expect(
      authorize({ user: viewerA, tenantIdHint: tenantA.id, permission: "membros:write" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const ctx = await authorize({
      user: ownerA,
      tenantIdHint: tenantA.id,
      permission: "membros:write",
    });
    expect(ctx.membership.role).toBe("OWNER");
  });
});
