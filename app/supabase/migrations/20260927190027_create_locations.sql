-- locations: uma empresa (tenant) pode ter múltiplas unidades físicas.
-- Endereço modelado sem suposição de mercado único (state_province livre,
-- postal_code em vez de zip_code, country ISO-3166-1 alpha-2) — preparado
-- pra expansão internacional, igual tenants.

create table locations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 200),
  is_primary      boolean not null default false,
  email           text,
  phone           text,
  address_line1   text,
  address_line2   text,
  city            text,
  state_province  text,
  postal_code     text,
  country         text check (country ~ '^[A-Z]{2}$'),
  timezone        text,
  status          text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (tenant_id, name)
);

create index idx_locations_tenant on locations (tenant_id);

-- No máximo uma location marcada is_primary=true por tenant (índice único
-- parcial — mais barato e mais confiável que um trigger de validação).
create unique index idx_locations_one_primary_per_tenant
  on locations (tenant_id)
  where is_primary;

create trigger set_updated_at
  before update on locations
  for each row execute function public.set_updated_at();

alter table locations enable row level security;

create policy locations_select on locations
  for select
  using (public.is_tenant_member(tenant_id));

-- Escrita de location fica restrita a OWNER/ADMIN nesta etapa (não existe
-- ainda um papel "gerente de unidade" granular — ver ARCHITECTURE.md,
-- RBAC pode ganhar granularidade por location numa etapa futura).
create policy locations_insert on locations
  for insert
  with check (public.is_tenant_admin(tenant_id));

create policy locations_update on locations
  for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy locations_delete on locations
  for delete
  using (public.is_tenant_admin(tenant_id));

-- Toda oficina nasce com uma location principal (a matriz), pra não obrigar
-- o app a criar isso manualmente logo depois do tenant.
create or replace function public.handle_new_tenant_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.locations (tenant_id, name, is_primary, email, phone, country, timezone)
  values (new.id, new.name, true, new.email, new.phone, new.country, new.timezone);
  return new;
end;
$$;

create trigger on_tenant_created_location
  after insert on tenants
  for each row execute function public.handle_new_tenant_location();
