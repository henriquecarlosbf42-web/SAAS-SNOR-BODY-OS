-- Policies de tenants: RLS já estava habilitado desde a criação da tabela
-- (postura fail-closed); aqui entram as regras de acesso, agora que
-- is_tenant_member/is_tenant_admin existem (definidas em
-- create_tenant_memberships.sql).

create policy tenants_select on tenants
  for select
  using (public.is_tenant_member(id));

-- Só OWNER/ADMIN edita dados do tenant (nome, contato, etc.) — criação
-- passa exclusivamente por create_tenant_with_owner (bootstrap), nunca
-- por insert direto de um client autenticado comum.
create policy tenants_update on tenants
  for update
  using (public.is_tenant_admin(id))
  with check (public.is_tenant_admin(id));
