-- tenant_settings: preferências configuráveis, separadas da identidade
-- core do tenant (tabela `tenants`) pra não inchar aquela tabela conforme
-- o produto ganha mais opção de configuração. 1:1 com tenants.

create table tenant_settings (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  default_locale     text not null default 'en' check (default_locale ~ '^[a-z]{2}$'),
  measurement_system text not null default 'imperial'
                     check (measurement_system in ('imperial', 'metric')),
  date_format        text not null default 'MM/DD/YYYY',
  week_start         text not null default 'sunday' check (week_start in ('sunday', 'monday')),
  invoice_prefix     text,
  business_hours     jsonb not null default '{}'::jsonb,
  extra              jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger set_updated_at
  before update on tenant_settings
  for each row execute function public.set_updated_at();

alter table tenant_settings enable row level security;

create policy tenant_settings_select on tenant_settings
  for select
  using (public.is_tenant_member(tenant_id));

create policy tenant_settings_update on tenant_settings
  for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- Cria a linha de settings (com os defaults) junto com o tenant — evita
-- todo módulo futuro ter que tratar "settings ainda não existe".
create or replace function public.handle_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_settings (tenant_id) values (new.id);
  return new;
end;
$$;

create trigger on_tenant_created
  after insert on tenants
  for each row execute function public.handle_new_tenant();
