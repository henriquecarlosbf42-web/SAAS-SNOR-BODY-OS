-- tenant_memberships: liga profiles (USER) a tenants (TENANT) com um papel
-- (RBAC). É o elo "MEMBERSHIP" do relacionamento USER -> MEMBERSHIP ->
-- TENANT -> LOCATIONS.

create table tenant_memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        text not null check (role in
                ('OWNER', 'ADMIN', 'MANAGER', 'SALES', 'ESTIMATOR',
                 'TECHNICIAN', 'FINANCE', 'VIEWER')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, user_id)
);

create index idx_tenant_memberships_user on tenant_memberships (user_id);
create index idx_tenant_memberships_tenant on tenant_memberships (tenant_id);

create trigger set_updated_at
  before update on tenant_memberships
  for each row execute function public.set_updated_at();

-- ============================================================
-- Funções auxiliares de autorização (SECURITY DEFINER)
--
-- Motivo de existirem: uma policy em tenant_memberships que fizesse
-- "select ... from tenant_memberships" pra decidir se o usuário pode ler
-- outra linha da própria tenant_memberships causaria recursão de RLS.
-- SECURITY DEFINER roda a função com o privilégio do dono da função (o
-- role que aplica a migration, dono das tabelas) — isso faz a consulta
-- interna ignorar RLS, quebrando a recursão. Usadas também pelas policies
-- de tenants/tenant_settings/locations. `set search_path = public` evita
-- sequestro de search_path (regra de segurança, não só estilo).
-- ============================================================

create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
  );
$$;

create or replace function public.is_tenant_admin(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role in ('OWNER', 'ADMIN')
  );
$$;

create or replace function public.is_tenant_owner(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role = 'OWNER'
  );
$$;

alter table tenant_memberships enable row level security;

-- Select: o próprio membership, ou qualquer membership do(s) tenant(s)
-- onde o usuário é OWNER/ADMIN (precisa enxergar a equipe).
create policy tenant_memberships_select on tenant_memberships
  for select
  using (
    user_id = auth.uid()
    or public.is_tenant_admin(tenant_id)
  );

-- Escrita (convite, promoção, remoção): só OWNER do tenant — regra
-- absoluta do SECURITY.md ("só OWNER convida/promove membros").
create policy tenant_memberships_insert on tenant_memberships
  for insert
  with check (public.is_tenant_owner(tenant_id));

create policy tenant_memberships_update on tenant_memberships
  for update
  using (public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_owner(tenant_id));

create policy tenant_memberships_delete on tenant_memberships
  for delete
  using (public.is_tenant_owner(tenant_id));

-- ============================================================
-- Bootstrap: criar tenant + primeiro membership (OWNER)
--
-- Sem isso, tenant_memberships_insert acima bloquearia PARA SEMPRE a
-- criação do primeiro membro de qualquer tenant novo (precisa já ser
-- OWNER pra inserir um membership, mas ninguém é OWNER antes do primeiro
-- insert). Essa função resolve o bootstrap de forma estreita: cria o
-- tenant e SEMPRE torna quem chamou (auth.uid(), nunca um user_id
-- passado por parâmetro) o OWNER — não é um bypass geral de RLS, só essa
-- operação específica.
-- ============================================================

create or replace function public.create_tenant_with_owner(
  p_name     text,
  p_slug     text,
  p_email    text,
  p_country  text,
  p_currency text default 'USD',
  p_timezone text default 'America/New_York'
)
returns tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant tenants;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória para criar um tenant';
  end if;

  insert into tenants (name, slug, email, country, currency, timezone)
  values (p_name, p_slug, p_email, p_country, p_currency, p_timezone)
  returning * into v_tenant;

  insert into tenant_memberships (tenant_id, user_id, role)
  values (v_tenant.id, auth.uid(), 'OWNER');

  return v_tenant;
end;
$$;

grant execute on function public.create_tenant_with_owner to authenticated;
