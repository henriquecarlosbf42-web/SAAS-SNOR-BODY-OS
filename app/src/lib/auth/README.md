# lib/auth/

> ETAPA 04 — implementado.

- `session.ts` — as 4 funções públicas: `getCurrentUser`,
  `getCurrentMembership`, `getCurrentTenant`, `getCurrentRole`. Adaptador
  fino: só monta parâmetros (usuário do Supabase Auth, hint de tenant do
  cookie `snor_active_tenant_id`) e delega a decisão pra
  `resolve-context.ts`.
- `resolve-context.ts` — a lógica de autorização em si (pura, testável
  sem Supabase real). Ver `tests/lib/auth/`.
- `supabase-membership-repository.ts` — adaptador real sobre
  `tenant_memberships`/`tenants` (schema de `DATABASE.md`). Não
  integration-testado ainda (sem projeto Supabase real).
- `types.ts`, `errors.ts` — tipos e erros compartilhados.

`rbac.ts` (`requireRole`, usado pelas Server Actions — `ARCHITECTURE.md`
seção 8) ainda não existe — etapa futura.
