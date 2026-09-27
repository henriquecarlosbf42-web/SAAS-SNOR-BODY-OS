-- ETAPA 05 — completa a matriz SELECT/INSERT/UPDATE/DELETE em profiles,
-- tenants, tenant_memberships, tenant_settings, locations.
--
-- tenant_memberships e locations já tinham as 4 operações cobertas desde
-- a ETAPA 03. profiles/tenants/tenant_settings tinham só SELECT/UPDATE —
-- INSERT/DELETE nessas três já eram negados de fato (RLS habilitado sem
-- policy = nega tudo pra quem não é dono da tabela), mas de forma
-- implícita. Esta migration torna isso EXPLÍCITO (policy nomeada,
-- auditável, testável), sem mudar o comportamento real:
--
-- - profiles: insert só via trigger handle_new_user (SECURITY DEFINER,
--   roda como dono da tabela — ignora RLS de qualquer forma). Delete não
--   existe como fluxo (some por cascade quando auth.users é apagado).
-- - tenants: insert só via create_tenant_with_owner (SECURITY DEFINER).
--   Delete de tenant não é uma operação suportada ainda.
-- - tenant_settings: insert só via trigger handle_new_tenant (SECURITY
--   DEFINER). Delete some por cascade quando o tenant é apagado.
--
-- Nenhuma dessas policies usa service_role como workaround — todo
-- bootstrap passa por função SECURITY DEFINER estreita (já existente),
-- nunca por dar service_role pro client ou a uma Server Action genérica.

create policy profiles_insert_denied on profiles
  for insert
  with check (false);

create policy profiles_delete_denied on profiles
  for delete
  using (false);

create policy tenants_insert_denied on tenants
  for insert
  with check (false);

create policy tenants_delete_denied on tenants
  for delete
  using (false);

create policy tenant_settings_insert_denied on tenant_settings
  for insert
  with check (false);

create policy tenant_settings_delete_denied on tenant_settings
  for delete
  using (false);
