create table customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  email       text check (email is null or char_length(email) <= 320),
  phone       text check (phone is null or char_length(phone) <= 40),
  locale      text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  notes       text check (notes is null or char_length(notes) <= 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  unique (tenant_id, id)
);

create index idx_customers_active_tenant_name
  on customers (tenant_id, name)
  where deleted_at is null;

create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null,
  make        text not null check (char_length(btrim(make)) between 1 and 120),
  model       text not null check (char_length(btrim(model)) between 1 and 120),
  year        integer not null check (year between 1886 and 2100),
  color       text check (color is null or char_length(color) <= 80),
  vin         text check (vin is null or char_length(vin) <= 32),
  plate       text check (plate is null or char_length(plate) <= 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  foreign key (tenant_id, customer_id)
    references customers (tenant_id, id)
    on delete cascade
);

create index idx_vehicles_active_tenant on vehicles (tenant_id) where deleted_at is null;
create index idx_vehicles_active_customer on vehicles (tenant_id, customer_id) where deleted_at is null;
create unique index idx_vehicles_active_vin
  on vehicles (tenant_id, upper(vin))
  where vin is not null and deleted_at is null;

create trigger customers_set_updated_at
  before update on customers
  for each row execute function public.set_updated_at();

create trigger vehicles_set_updated_at
  before update on vehicles
  for each row execute function public.set_updated_at();

create or replace function public.is_tenant_crm_writer(check_tenant_id uuid)
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
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
  );
$$;

create or replace function public.is_tenant_crm_reader(check_tenant_id uuid)
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

revoke all on function public.is_tenant_crm_writer(uuid) from public;
grant execute on function public.is_tenant_crm_writer(uuid) to authenticated;
revoke all on function public.is_tenant_crm_reader(uuid) from public;
grant execute on function public.is_tenant_crm_reader(uuid) to authenticated, anon;

alter table customers enable row level security;
alter table vehicles enable row level security;

create policy customers_select on customers
  for select
  using (public.is_tenant_crm_reader(tenant_id));

create policy customers_insert on customers
  for insert
  with check (public.is_tenant_crm_writer(tenant_id));

create policy customers_update on customers
  for update
  using (public.is_tenant_crm_writer(tenant_id))
  with check (public.is_tenant_crm_writer(tenant_id));

create policy customers_delete_denied on customers
  for delete
  using (false);

create policy vehicles_select on vehicles
  for select
  using (public.is_tenant_crm_reader(tenant_id));

create policy vehicles_insert on vehicles
  for insert
  with check (
    public.is_tenant_crm_writer(tenant_id)
    and exists (
      select 1
      from customers
      where customers.tenant_id = vehicles.tenant_id
        and customers.id = vehicles.customer_id
        and customers.deleted_at is null
    )
  );

create policy vehicles_update on vehicles
  for update
  using (public.is_tenant_crm_writer(tenant_id))
  with check (
    public.is_tenant_crm_writer(tenant_id)
    and exists (
      select 1
      from customers
      where customers.tenant_id = vehicles.tenant_id
        and customers.id = vehicles.customer_id
        and customers.deleted_at is null
    )
  );

create policy vehicles_delete_denied on vehicles
  for delete
  using (false);
