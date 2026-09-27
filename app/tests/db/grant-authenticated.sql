-- Aplicado depois das migrations reais (as tabelas já existem nesse
-- ponto). No Supabase real esses grants já vêm provisionados pela
-- plataforma pros roles `authenticated` e `anon` — aqui só replicamos o
-- suficiente pra RLS ser exercitado de verdade no teste. `anon` recebe os
-- mesmos GRANTs de tabela que `authenticated` (igual ao Supabase real):
-- quem barra o acesso é a RLS (auth.uid() nunca bate pra uma requisição
-- anônima), não a ausência de GRANT — é isso que este teste precisa
-- provar, não simular via um atalho de permissão diferente.
grant select, insert, update, delete on
  profiles, tenants, tenant_memberships, tenant_settings, locations
  to authenticated, anon;
