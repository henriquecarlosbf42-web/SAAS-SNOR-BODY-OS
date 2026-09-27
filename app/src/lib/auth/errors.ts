/**
 * Erros tipados da resolução de contexto (usuário -> membership -> tenant
 * -> role). Quem chama (Server Action, Route Handler — etapa futura)
 * decide como traduzir cada um em resposta HTTP; nenhum aqui carrega
 * detalhe interno (nome de tabela, query) que não deva chegar ao usuário
 * final — ver SECURITY.md seção 5.
 */

export class UnauthenticatedError extends Error {
  constructor() {
    super("Usuário não autenticado");
    this.name = "UnauthenticatedError";
  }
}

export class NoMembershipError extends Error {
  readonly tenantId?: string;

  constructor(tenantId?: string) {
    super(
      tenantId
        ? `Usuário não possui membership ativa para o tenant informado`
        : "Usuário não possui nenhuma membership ativa",
    );
    this.name = "NoMembershipError";
    this.tenantId = tenantId;
  }
}

export class TenantInactiveError extends Error {
  readonly status: string;

  constructor(status: string) {
    super("Tenant não está ativo");
    this.name = "TenantInactiveError";
    this.status = status;
  }
}

export class AmbiguousTenantError extends Error {
  readonly tenantIds: string[];

  constructor(tenantIds: string[]) {
    super(
      "Usuário pertence a múltiplos tenants e nenhum foi especificado — resolução ambígua",
    );
    this.name = "AmbiguousTenantError";
    this.tenantIds = tenantIds;
  }
}

export class ForbiddenError extends Error {
  readonly role: string;
  readonly permission: string;

  constructor(role: string, permission: string) {
    super("Papel não tem permissão para essa ação");
    this.name = "ForbiddenError";
    this.role = role;
    this.permission = permission;
  }
}
