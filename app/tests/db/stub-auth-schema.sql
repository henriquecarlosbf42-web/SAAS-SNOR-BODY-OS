-- Stub mínimo do que o Supabase fornece de fábrica, só para rodar as
-- migrations reais localmente sem Docker (PGlite não é Supabase — isso
-- aqui existe só nos testes, nunca nas migrations de produção em
-- supabase/migrations/).

create schema if not exists auth;

create table auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- auth.uid(): no Supabase real, lê o JWT da requisição. Aqui lê uma GUC de
-- sessão que o teste seta antes de cada query (simula "logar como X").
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

-- Roles não-superusuário, sem BYPASSRLS — equivalentes aos roles
-- "authenticated" e "anon" que o Supabase provisiona de verdade. Sem
-- isso, todas as queries rodariam como superuser e RLS nunca seria de
-- fato exercitado. `anon` é o role real de requisição sem sessão (não
-- só "authenticated com auth.uid() nulo") — usado no teste de "usuário
-- sem autenticação" pra refletir o Supabase de verdade.
--
-- Os GRANTs nas tabelas de public ficam pra depois de aplicar as
-- migrations (as tabelas ainda não existem neste ponto) — ver
-- grant-authenticated.sql, aplicado por setup.ts após as migrations.
create role authenticated nosuperuser nobypassrls;
create role anon nosuperuser nobypassrls;
create role service_role nosuperuser bypassrls;
grant usage on schema public to authenticated, anon, service_role;
