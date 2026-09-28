import type { Role } from "./types";

/**
 * Sistema centralizado de permissões — única fonte de verdade de "quem
 * pode fazer o quê". Regra do CLAUDE.md: "nunca duplicar regras de
 * autorização em dezenas de arquivos". Toda Server Action futura chama
 * `can()` (via `requirePermission` em `rbac.ts`) em vez de checar
 * `role === "OWNER"` espalhado pelo código.
 *
 * A matriz abaixo é o espelho em código de SECURITY.md seção 1 — se um
 * módulo mudar de permissão, muda aqui E lá, os dois de propósito (RBAC
 * de app é só uma das duas camadas; RLS no banco é a outra e nunca
 * confia neste arquivo).
 */

export type Module =
  | "crm"
  | "conversations"
  | "orcamento"
  | "aprovacao_orcamento"
  | "ordem_servico"
  | "producao"
  | "estoque"
  | "compras"
  | "financeiro"
  | "entrega"
  | "pos_venda"
  | "billing"
  | "membros"
  | "configuracoes";

export type Action = "read" | "write" | "approve";

export type Permission = `${Module}:${Action}`;

/** "" = sem acesso, "r" = read, "rw" = read+write, "rwa" = read+write+approve. */
type Grant = "" | "r" | "rw" | "rwa";

const GRANT_ACTIONS: Record<Grant, Action[]> = {
  "": [],
  r: ["read"],
  rw: ["read", "write"],
  rwa: ["read", "write", "approve"],
};

/**
 * Uma linha por módulo, uma coluna por papel — mesma ordem/conteúdo da
 * tabela em SECURITY.md seção 1.
 *
 * Nota sobre TECHNICIAN em `ordem_servico`/`producao`: a tabela documenta
 * "só a própria OS" — isso é um recorte por LINHA (assigned_to = usuário
 * atual), que `can()` não expressa (ela só sabe o papel, não qual OS).
 * `can()` autoriza o módulo na entrada; o filtro por OS específica é
 * responsabilidade da query (RLS, quando ordem_servico for implementada —
 * ARCHITECTURE.md seção 15/16) — as duas camadas continuam obrigatórias.
 */
const MATRIX: Record<Module, Record<Role, Grant>> = {
  crm: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "rw",
    ESTIMATOR: "r",
    TECHNICIAN: "",
    FINANCE: "r",
    VIEWER: "r",
  },
  conversations: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "rw",
    ESTIMATOR: "r",
    TECHNICIAN: "",
    FINANCE: "r",
    VIEWER: "r",
  },
  orcamento: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "rw",
    ESTIMATOR: "rw",
    TECHNICIAN: "",
    FINANCE: "r",
    VIEWER: "r",
  },
  aprovacao_orcamento: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "rw",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "",
    VIEWER: "r",
  },
  ordem_servico: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "r",
    ESTIMATOR: "r",
    TECHNICIAN: "r", // só a própria OS — ver nota acima
    FINANCE: "",
    VIEWER: "r",
  },
  producao: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "rw", // só a própria OS — ver nota acima
    FINANCE: "",
    VIEWER: "r",
  },
  estoque: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "r",
    FINANCE: "r",
    VIEWER: "r",
  },
  compras: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "rw",
    VIEWER: "r",
  },
  financeiro: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "r",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "rw",
    VIEWER: "r",
  },
  entrega: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "r",
    ESTIMATOR: "",
    TECHNICIAN: "r",
    FINANCE: "",
    VIEWER: "r",
  },
  pos_venda: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "rw",
    SALES: "r",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "",
    VIEWER: "r",
  },
  billing: {
    OWNER: "rwa",
    ADMIN: "",
    MANAGER: "",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "",
    VIEWER: "",
  },
  // ADMIN é "r" aqui (não "rw" como uma versão antiga deste doc dizia) —
  // corrigido na ETAPA 06 pra bater com a RLS real de tenant_memberships
  // (só is_tenant_owner escreve — ver DATABASE.md seção 1 e
  // supabase/migrations/20260927190015_create_tenant_memberships.sql).
  // Só OWNER convida/promove/remove membro, nunca ADMIN.
  membros: {
    OWNER: "rwa",
    ADMIN: "r",
    MANAGER: "",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "",
    VIEWER: "",
  },
  configuracoes: {
    OWNER: "rwa",
    ADMIN: "rw",
    MANAGER: "",
    SALES: "",
    ESTIMATOR: "",
    TECHNICIAN: "",
    FINANCE: "",
    VIEWER: "",
  },
};

const PERMISSION_SET_BY_ROLE: Record<Role, ReadonlySet<Permission>> = buildPermissionSets();

function buildPermissionSets(): Record<Role, ReadonlySet<Permission>> {
  const roles = Object.keys(MATRIX.crm) as Role[];
  const result = {} as Record<Role, Set<Permission>>;

  for (const role of roles) {
    result[role] = new Set<Permission>();
  }

  for (const [module, grantsByRole] of Object.entries(MATRIX) as [Module, Record<Role, Grant>][]) {
    for (const role of roles) {
      const actions = GRANT_ACTIONS[grantsByRole[role]];
      for (const action of actions) {
        result[role].add(`${module}:${action}`);
      }
    }
  }

  return result;
}

/**
 * `can(role, permission)` — a única função que qualquer código deveria
 * chamar pra decidir "esse papel pode fazer isso?". Papel desconhecido
 * (string corrompida, bug, role removido) nunca autoriza nada — falha
 * fechado, não aberto.
 */
export function can(role: string, permission: Permission): boolean {
  const permissions = PERMISSION_SET_BY_ROLE[role as Role];
  if (!permissions) return false;
  return permissions.has(permission);
}

/** Lista todas as permissões de um papel — útil pra UI (esconder o que não se pode fazer) e debug. */
export function permissionsOf(role: string): ReadonlySet<Permission> {
  return PERMISSION_SET_BY_ROLE[role as Role] ?? new Set();
}
