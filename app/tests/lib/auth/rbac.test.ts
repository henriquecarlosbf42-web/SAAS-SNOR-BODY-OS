import { describe, expect, it } from "vitest";
import { assertPermission } from "@/lib/auth/rbac";
import { ForbiddenError } from "@/lib/auth/errors";

describe("assertPermission — guarda usada pelas Server Actions", () => {
  it("não lança quando o papel tem a permissão", () => {
    expect(() => assertPermission("MANAGER", "crm:write")).not.toThrow();
  });

  it("lança ForbiddenError quando o papel não tem a permissão", () => {
    expect(() => assertPermission("SALES", "financeiro:write")).toThrow(ForbiddenError);
  });

  it("lança ForbiddenError (não outra coisa) pra role inválida", () => {
    expect(() => assertPermission("SUPERADMIN", "crm:read")).toThrow(ForbiddenError);
  });

  it("erro carrega role e permission pra quem for tratar (nunca detalhe interno de query/tabela)", () => {
    try {
      assertPermission("VIEWER", "crm:write");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).role).toBe("VIEWER");
      expect((error as ForbiddenError).permission).toBe("crm:write");
    }
  });
});
