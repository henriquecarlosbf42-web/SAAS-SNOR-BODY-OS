import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Membership, MembershipRepository, Role, Tenant } from "./types";

/**
 * Adaptador real de MembershipRepository, sobre tenant_memberships/tenants
 * (schema de DATABASE.md, ETAPA 03). Depende de RLS para o isolamento de
 * dado em si — este código só decide QUAL consulta rodar, não é a última
 * linha de defesa (Postgres é).
 *
 * Sem projeto Supabase real ainda: este arquivo não é exercitado por
 * teste automatizado nesta etapa (ver tests/lib/auth/, que testam
 * resolve-context.ts com um repositório fake). A forma da query casa com
 * o schema real de DATABASE.md; validação de integração fica pra quando
 * o projeto Supabase existir.
 */
export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findActiveMembershipsByUser(userId: string): Promise<Membership[]> {
    const { data, error } = await this.supabase
      .from("tenant_memberships")
      .select("id, tenant_id, user_id, role, is_active, tenant:tenants(id, name, slug, status)")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      throw new Error("Falha ao consultar memberships do usuário");
    }

    return (data ?? []).map(mapRow);
  }

  async findActiveMembership(userId: string, tenantId: string): Promise<Membership | null> {
    const { data, error } = await this.supabase
      .from("tenant_memberships")
      .select("id, tenant_id, user_id, role, is_active, tenant:tenants(id, name, slug, status)")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error("Falha ao consultar membership do usuário no tenant informado");
    }

    return data ? mapRow(data) : null;
  }
}

interface MembershipRow {
  id: string;
  tenant_id: string;
  user_id: string;
  role: Role;
  is_active: boolean;
  // Sem lib/db/types.ts gerado ainda (schema real não existe/vinculado),
  // o supabase-js infere o join genericamente como lista — no banco é
  // 1:1 (tenant_id not null references tenants(id)). Normalizado abaixo.
  tenant: Tenant | Tenant[] | null;
}

function mapRow(row: MembershipRow): Membership {
  const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
  if (!tenant) {
    // FK tenant_id -> tenants(id) not null garante que isso nunca deveria
    // acontecer — se acontecer, é sinal de dado inconsistente, não um
    // caso de negócio esperado.
    throw new Error("Membership sem tenant associado — dado inconsistente");
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    isActive: row.is_active,
    tenant,
  };
}
