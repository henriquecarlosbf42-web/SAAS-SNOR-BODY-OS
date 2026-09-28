-- Orçamentos (ETAPA 10). Modelo e RLS espelham DATABASE.md seção 3 e o
-- mesmo padrão de 20260927200000_create_crm_customers_vehicles.sql
-- (funções SECURITY DEFINER is_tenant_<module>_writer/reader, RLS
-- fail-closed, soft-delete não aplicável aqui — orçamento nunca é
-- apagado, só cancelado via status).
--
-- quote_photos fica fora desta migration de propósito: depende do bucket
-- de Storage (ARCHITECTURE.md seção 9), que ainda não foi provisionado —
-- entra numa migration separada quando Storage for implementado.

-- vehicles não tinha unique(tenant_id, id) (só customers tinha, na
-- migration original do CRM) — precisamos dela aqui pra poder referenciar
-- (tenant_id, vehicle_id) via foreign key composta, mesma garantia que já
-- existe para customer_id.
alter table vehicles add constraint vehicles_tenant_id_id_key unique (tenant_id, id);

create table quotes (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  customer_id        uuid not null,
  vehicle_id         uuid not null,
  status             text not null default 'PENDING' check (status in
                       ('PENDING', 'IN_REVIEW', 'QUOTED', 'APPROVED',
                        'REJECTED', 'EXPIRED', 'CANCELLED')),
  service_category   text not null check (char_length(btrim(service_category)) between 1 and 120),
  damage_description text not null check (char_length(btrim(damage_description)) between 1 and 5000),
  estimated_price    numeric(10, 2) check (estimated_price is null or estimated_price >= 0),
  estimated_days     integer check (estimated_days is null or estimated_days >= 0),
  shop_notes         text check (shop_notes is null or char_length(shop_notes) <= 5000),
  quote_expires_at   timestamptz,
  access_token       uuid not null default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (tenant_id, id),

  -- Garante que o veículo pertence ao mesmo cliente do orçamento (não só
  -- ao mesmo tenant) — evita um orçamento apontar pro carro de outro
  -- cliente do mesmo tenant por engano/manipulação de payload.
  foreign key (tenant_id, customer_id)
    references customers (tenant_id, id),
  foreign key (tenant_id, vehicle_id)
    references vehicles (tenant_id, id)
);

create unique index idx_quotes_access_token on quotes (access_token);
create index idx_quotes_tenant_status on quotes (tenant_id, status);
create index idx_quotes_tenant_customer on quotes (tenant_id, customer_id);
create index idx_quotes_tenant_vehicle on quotes (tenant_id, vehicle_id);

create table quote_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  quote_id     uuid not null,
  description  text not null check (char_length(btrim(description)) between 1 and 500),
  quantity     integer not null default 1 check (quantity > 0),
  unit_price   numeric(10, 2) not null check (unit_price >= 0),
  total_price  numeric(10, 2) not null check (total_price >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  foreign key (tenant_id, quote_id)
    references quotes (tenant_id, id)
    on delete cascade
);

create index idx_quote_items_tenant_quote on quote_items (tenant_id, quote_id);

create trigger quotes_set_updated_at
  before update on quotes
  for each row execute function public.set_updated_at();

create trigger quote_items_set_updated_at
  before update on quote_items
  for each row execute function public.set_updated_at();

-- ============================================================
-- RBAC (espelha a matriz de src/lib/auth/permissions.ts, módulo
-- "orcamento": OWNER/ADMIN/MANAGER/SALES/ESTIMATOR = rw,
-- FINANCE/VIEWER = r, TECHNICIAN = sem acesso).
-- ============================================================

create or replace function public.is_tenant_orcamento_writer(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES', 'ESTIMATOR')
  );
$$;

create or replace function public.is_tenant_orcamento_reader(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES', 'ESTIMATOR', 'FINANCE', 'VIEWER')
  );
$$;

revoke all on function public.is_tenant_orcamento_writer(uuid) from public;
grant execute on function public.is_tenant_orcamento_writer(uuid) to authenticated;
revoke all on function public.is_tenant_orcamento_reader(uuid) from public;
grant execute on function public.is_tenant_orcamento_reader(uuid) to authenticated, anon;

alter table quotes enable row level security;
alter table quote_items enable row level security;

create policy quotes_select on quotes
  for select
  using (public.is_tenant_orcamento_reader(tenant_id));

create policy quotes_insert on quotes
  for insert
  with check (
    public.is_tenant_orcamento_writer(tenant_id)
    and exists (
      select 1 from customers
      where customers.tenant_id = quotes.tenant_id
        and customers.id = quotes.customer_id
        and customers.deleted_at is null
    )
    and exists (
      select 1 from vehicles
      where vehicles.tenant_id = quotes.tenant_id
        and vehicles.id = quotes.vehicle_id
        and vehicles.deleted_at is null
    )
  );

create policy quotes_update on quotes
  for update
  using (public.is_tenant_orcamento_writer(tenant_id))
  with check (
    public.is_tenant_orcamento_writer(tenant_id)
    and exists (
      select 1 from customers
      where customers.tenant_id = quotes.tenant_id
        and customers.id = quotes.customer_id
        and customers.deleted_at is null
    )
    and exists (
      select 1 from vehicles
      where vehicles.tenant_id = quotes.tenant_id
        and vehicles.id = quotes.vehicle_id
        and vehicles.deleted_at is null
    )
  );

-- Orçamento nunca é apagado, só cancelado via status (regra de negócio —
-- mantém histórico/auditoria). Delete sempre negado, igual customers/vehicles.
create policy quotes_delete_denied on quotes
  for delete
  using (false);

create policy quote_items_select on quote_items
  for select
  using (public.is_tenant_orcamento_reader(tenant_id));

create policy quote_items_insert on quote_items
  for insert
  with check (
    public.is_tenant_orcamento_writer(tenant_id)
    and exists (
      select 1 from quotes
      where quotes.tenant_id = quote_items.tenant_id
        and quotes.id = quote_items.quote_id
    )
  );

create policy quote_items_update on quote_items
  for update
  using (public.is_tenant_orcamento_writer(tenant_id))
  with check (
    public.is_tenant_orcamento_writer(tenant_id)
    and exists (
      select 1 from quotes
      where quotes.tenant_id = quote_items.tenant_id
        and quotes.id = quote_items.quote_id
    )
  );

create policy quote_items_delete on quote_items
  for delete
  using (public.is_tenant_orcamento_writer(tenant_id));
