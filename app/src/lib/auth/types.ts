export type Role =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "SALES"
  | "ESTIMATOR"
  | "TECHNICIAN"
  | "FINANCE"
  | "VIEWER";

export type TenantStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

/** Usuário autenticado — nunca confundir com `profiles` completo (esse é só o essencial pra autorização). */
export interface AuthUser {
  id: string;
  email: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
}

export interface Membership {
  id: string;
  tenantId: string;
  userId: string;
  role: Role;
  isActive: boolean;
  tenant: Tenant;
}

/**
 * Porta (interface) que a lógica de resolução em `resolve-context.ts`
 * depende — nunca do client Supabase diretamente. Isso é o que permite
 * testar a lógica de autorização com um fake, sem precisar de um projeto
 * Supabase real (ver tests/lib/auth/fake-membership-repository.ts).
 */
export interface MembershipRepository {
  findActiveMembershipsByUser(userId: string): Promise<Membership[]>;
  findActiveMembership(userId: string, tenantId: string): Promise<Membership | null>;
}
