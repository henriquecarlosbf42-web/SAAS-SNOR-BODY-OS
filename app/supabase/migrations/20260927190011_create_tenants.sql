-- tenants: cada oficina é um tenant. Campos pensados para expansão
-- internacional (currency/country/timezone livres de qualquer suposição de
-- mercado único). RLS habilitado numa migration separada (precisa das
-- funções de tenant_memberships, que ainda não existe neste ponto).

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legal_name  text,
  tax_id      text,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text,
  website     text,
  logo_url    text,
  timezone    text not null default 'America/New_York',
  currency    text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  country     text not null check (country ~ '^[A-Z]{2}$'),
  status      text not null default 'TRIAL'
              check (status in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index idx_tenants_email on tenants (email);

create trigger set_updated_at
  before update on tenants
  for each row execute function public.set_updated_at();

-- RLS habilitado, mas sem policy ainda nesta migration: enquanto isso,
-- nenhuma linha é visível/gravável por ninguém além do dono da tabela
-- (postgres/service_role) — postura "fail closed", nunca "fail open".
-- Policies chegam em 20260927190019_enable_tenants_rls.sql, depois que
-- as funções auxiliares de tenant_memberships existirem.
alter table tenants enable row level security;
