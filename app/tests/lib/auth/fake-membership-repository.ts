import type { Membership, MembershipRepository } from "@/lib/auth/types";

/**
 * Repositório em memória — só pra teste. Implementa a mesma porta
 * (MembershipRepository) que SupabaseMembershipRepository, então exercita
 * exatamente a mesma lógica de decisão (resolve-context.ts) que rodaria
 * em produção, sem precisar de um projeto Supabase real.
 */
export class FakeMembershipRepository implements MembershipRepository {
  calls: { method: string; args: unknown[] }[] = [];

  constructor(private readonly memberships: Membership[]) {}

  async findActiveMembershipsByUser(userId: string): Promise<Membership[]> {
    this.calls.push({ method: "findActiveMembershipsByUser", args: [userId] });
    return this.memberships.filter((m) => m.userId === userId && m.isActive);
  }

  async findActiveMembership(userId: string, tenantId: string): Promise<Membership | null> {
    this.calls.push({ method: "findActiveMembership", args: [userId, tenantId] });
    return (
      this.memberships.find(
        (m) => m.userId === userId && m.tenantId === tenantId && m.isActive,
      ) ?? null
    );
  }
}
