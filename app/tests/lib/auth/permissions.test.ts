import { describe, expect, it } from "vitest";
import { can, permissionsOf } from "@/lib/auth/permissions";

/**
 * Testa o sistema centralizado de permissões isoladamente — sem
 * Supabase, sem tenant resolution (isso é resolve-context.test.ts).
 * Cobre "role inválida", "privilege escalation" e "acesso indevido a
 * módulos" pedidos na ETAPA 06.
 */
describe("can() — sistema centralizado de permissões", () => {
  it("OWNER tem acesso total, inclusive approve, em todo módulo", () => {
    expect(can("OWNER", "financeiro:approve")).toBe(true);
    expect(can("OWNER", "billing:write")).toBe(true);
    expect(can("OWNER", "membros:write")).toBe(true);
  });

  it("VIEWER nunca escreve em nada, só lê", () => {
    expect(can("VIEWER", "crm:read")).toBe(true);
    expect(can("VIEWER", "crm:write")).toBe(false);
    expect(can("VIEWER", "financeiro:write")).toBe(false);
    expect(can("VIEWER", "membros:read")).toBe(false); // nem ler membros
  });

  it("role inválida nunca autoriza nada (falha fechado)", () => {
    expect(can("SUPERADMIN", "crm:read")).toBe(false);
    expect(can("", "crm:read")).toBe(false);
    expect(can("owner", "crm:read")).toBe(false); // case-sensitive, "owner" != "OWNER"
    expect(permissionsOf("SUPERADMIN").size).toBe(0);
  });

  it("privilege escalation: SALES não escreve financeiro nem billing mesmo tendo bastante acesso em CRM/orçamento", () => {
    expect(can("SALES", "crm:write")).toBe(true);
    expect(can("SALES", "financeiro:write")).toBe(false);
    expect(can("SALES", "financeiro:read")).toBe(false);
    expect(can("SALES", "billing:write")).toBe(false);
    expect(can("SALES", "billing:read")).toBe(false);
  });

  it("privilege escalation: FINANCE só lê CRM (não escreve) e não acessa produção", () => {
    expect(can("FINANCE", "crm:read")).toBe(true); // lê, pra dar contexto em cobrança
    expect(can("FINANCE", "crm:write")).toBe(false);
    expect(can("FINANCE", "producao:read")).toBe(false);
    expect(can("FINANCE", "financeiro:write")).toBe(true); // tem no que é dele
  });

  it("acesso indevido a módulos: TECHNICIAN não acessa financeiro, compras nem billing", () => {
    expect(can("TECHNICIAN", "financeiro:read")).toBe(false);
    expect(can("TECHNICIAN", "compras:read")).toBe(false);
    expect(can("TECHNICIAN", "billing:read")).toBe(false);
    expect(can("TECHNICIAN", "crm:read")).toBe(false); // nem CRM
  });

  it("alteração indevida de role: só OWNER escreve em membros (ADMIN só lê, nunca convida/promove)", () => {
    expect(can("OWNER", "membros:write")).toBe(true);
    expect(can("ADMIN", "membros:write")).toBe(false);
    expect(can("ADMIN", "membros:read")).toBe(true);
    expect(can("MANAGER", "membros:read")).toBe(false);
  });

  it("approve é exclusivo de OWNER em todo módulo (nenhum outro papel tem 'approve')", () => {
    const modulesWithApprove = [
      "crm",
      "orcamento",
      "aprovacao_orcamento",
      "ordem_servico",
      "producao",
      "estoque",
      "compras",
      "financeiro",
      "entrega",
      "pos_venda",
      "billing",
      "membros",
      "configuracoes",
    ] as const;

    for (const role of ["ADMIN", "MANAGER", "SALES", "ESTIMATOR", "TECHNICIAN", "FINANCE", "VIEWER"] as const) {
      for (const mod of modulesWithApprove) {
        expect(can(role, `${mod}:approve`)).toBe(false);
      }
    }
  });

  it("permissionsOf lista exatamente o que can() concede (consistência interna)", () => {
    const set = permissionsOf("ESTIMATOR");
    expect(set.has("orcamento:write")).toBe(true);
    expect(set.has("financeiro:write")).toBe(false);
    for (const permission of set) {
      expect(can("ESTIMATOR", permission)).toBe(true);
    }
  });
});
