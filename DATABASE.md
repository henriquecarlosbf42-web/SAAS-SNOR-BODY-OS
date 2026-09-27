# Database — SNOR FUNILARIA

> v2 — 2026-09-27 (ETAPA 03). Seção 1 abaixo está **implementada** —
> migrations reais em `app/supabase/migrations/`, testadas contra Postgres
> de verdade (ver DEVELOPMENT.md / relatório da ETAPA 03). Seções 2 em
> diante continuam **design**, não implementadas ainda (etapas futuras,
> aguardando autorização — ver `CLAUDE.md`: "não criar ainda CRM,
> clientes, veículos, OS, estoque, financeiro").
>
> Convenção geral: `uuid` como PK (`gen_random_uuid()`),
> `created_at`/`updated_at` em tudo (trigger `set_updated_at`
> compartilhado), soft delete (`deleted_at`) nas tabelas onde exclusão é
> irreversível de forma perigosa — a decidir tabela a tabela quando forem
> implementadas.

Aproveitado do desenho anterior (schema Prisma em `app-legado-nestjs/`):
o modelo de `quotes`/`quote_items`/`quote_photos` e a ideia de
`audit_logs` (seções 2+, ainda design). Mudanças em relação ao legado:
`Customer` deixa de ser global — a regra de segurança nº 13 do
`CLAUDE.md` exige isolamento por tenant pra dados de cliente (CRM real,
não diretório compartilhado), e `shop_id`/`current_setting` viram
`tenant_id`/`auth.uid()` (ver `ARCHITECTURE.md` seção 3 pro motivo).

---

## 1. Núcleo de acesso — IMPLEMENTADO (ETAPA 03)

Relacionamento: `USER (profiles) → MEMBERSHIP (tenant_memberships) →
TENANT (tenants) → LOCATIONS (locations)`, mais `tenant_settings` (1:1
com tenant). Migrations em `app/supabase/migrations/`:

```
20260927190007_create_profiles.sql
20260927190011_create_tenants.sql
20260927190015_create_tenant_memberships.sql
20260927190019_enable_tenants_rls.sql
20260927190023_create_tenant_settings.sql
20260927190027_create_locations.sql
```

### profiles

Representação em `public` do usuário (`auth.users` é gerenciado pelo
Supabase Auth, 1:1 com `profiles`). Não é tenant-scoped — um usuário
existe independente de qualquer tenant.

```sql
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  locale      text not null default 'en' check (locale ~ '^[a-z]{2}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Trigger `on_auth_user_created` (`handle_new_user`, `security definer`)
cria a linha automaticamente a cada novo `auth.users` — padrão oficial
do Supabase. RLS: usuário só lê/edita o próprio perfil
(`profiles_select_own`, `profiles_update_own`); visibilidade de perfil
de outros membros do mesmo tenant fica pra quando a tela de "membros"
existir (não implementado ainda).

### tenants

Campos pensados pra expansão internacional desde o início — sem
suposição de mercado único em nenhum campo:

```sql
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legal_name  text,
  tax_id      text,                                  -- formato varia por país, não validado no banco
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text,
  website     text,
  logo_url    text,
  timezone    text not null default 'America/New_York',
  currency    text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),  -- ISO 4217
  country     text not null check (country ~ '^[A-Z]{2}$'),                 -- ISO 3166-1 alpha-2
  status      text not null default 'TRIAL'
              check (status in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

RLS habilitado desde a criação (postura fail-closed), policies
(`tenants_select`, `tenants_update`) chegam só depois que as funções
auxiliares existem (ver abaixo). **Sem policy de insert** — criação de
tenant passa exclusivamente pela função de bootstrap, nunca por insert
direto do client.

### tenant_memberships

Elo MEMBERSHIP — liga `profiles` a `tenants` com um papel (RBAC, os
mesmos 8 papéis do `SECURITY.md`):

```sql
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
```

### Funções auxiliares de autorização (SECURITY DEFINER)

Substituem o padrão `tenant_id in (select ... from memberships where
user_id = auth.uid())` repetido em toda policy (como o v1 deste
documento desenhava) por três funções, evitando **recursão de RLS**
(uma policy em `tenant_memberships` que consulta a própria
`tenant_memberships` para decidir se pode ler outra linha dela mesma):

```sql
create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from tenant_memberships
    where tenant_id = check_tenant_id and user_id = auth.uid() and is_active);
$$;

create or replace function public.is_tenant_admin(check_tenant_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from tenant_memberships
    where tenant_id = check_tenant_id and user_id = auth.uid()
      and is_active and role in ('OWNER', 'ADMIN'));
$$;

create or replace function public.is_tenant_owner(check_tenant_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from tenant_memberships
    where tenant_id = check_tenant_id and user_id = auth.uid()
      and is_active and role = 'OWNER');
$$;
```

`security definer` roda com o privilégio do dono da função (quem aplica
a migration), então a consulta interna ignora RLS — é isso que quebra a
recursão. `set search_path = public` evita sequestro de search_path
(regra de segurança, não só estilo). Usadas em toda policy de
`tenants`, `tenant_settings`, `locations` e do próprio
`tenant_memberships`.

Policies de `tenant_memberships`: leitura é a própria linha OU
qualquer linha do tenant onde o usuário é admin (`is_tenant_admin`);
insert/update/delete exigem `is_tenant_owner` — regra do `SECURITY.md`
("só OWNER convida/promove membros").

### Bootstrap: `create_tenant_with_owner`

Problema resolvido: a policy de insert de `tenant_memberships` acima
exige já ser OWNER — o que impediria PARA SEMPRE a criação do primeiro
membro de qualquer tenant novo. Função estreita (não é um bypass geral
de RLS) que cria o tenant e sempre torna quem chamou (`auth.uid()`,
nunca um parâmetro) o OWNER:

```sql
create or replace function public.create_tenant_with_owner(
  p_name text, p_slug text, p_email text, p_country text,
  p_currency text default 'USD', p_timezone text default 'America/New_York'
) returns tenants language plpgsql security definer set search_path = public as $$
declare v_tenant tenants;
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
end; $$;
```

Ao criar o tenant, dois triggers disparam automaticamente (também
`security definer`, mesma razão): `on_tenant_created` cria a linha de
`tenant_settings` (com os defaults) e `on_tenant_created_location` cria
a `location` principal (`is_primary = true`) copiando nome/email/
telefone/país/timezone do tenant — nenhum módulo futuro precisa tratar
"settings ainda não existe" ou "empresa sem nenhuma unidade".

### tenant_settings

1:1 com `tenants`, separado da identidade core pra não inchar aquela
tabela conforme o produto ganha configuração:

```sql
create table tenant_settings (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  default_locale     text not null default 'en' check (default_locale ~ '^[a-z]{2}$'),
  measurement_system text not null default 'imperial'
                     check (measurement_system in ('imperial', 'metric')),
  date_format        text not null default 'MM/DD/YYYY',
  week_start         text not null default 'sunday' check (week_start in ('sunday', 'monday')),
  invoice_prefix     text,
  business_hours     jsonb not null default '{}'::jsonb,
  extra              jsonb not null default '{}'::jsonb,  -- configuração futura sem precisar de migration
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

RLS: leitura por qualquer membro (`is_tenant_member`), escrita só
admin/owner (`is_tenant_admin`).

### locations

Uma empresa pode ter múltiplas unidades. Endereço modelado sem
suposição de mercado único (`state_province` livre em vez de "state",
`postal_code` em vez de "zip_code", `country` ISO alpha-2):

```sql
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

-- No máximo uma location is_primary=true por tenant — índice único parcial,
-- mais barato e mais confiável que um trigger de validação.
create unique index idx_locations_one_primary_per_tenant
  on locations (tenant_id) where is_primary;
```

RLS: leitura por qualquer membro; escrita restrita a OWNER/ADMIN nesta
etapa (ainda não existe papel "gerente de unidade" granular — RBAC pode
ganhar granularidade por location numa etapa futura).

### O que ficou de fora desta etapa (por decisão, não esquecimento)

- Visibilidade de perfil entre membros do mesmo tenant (só self por
  enquanto).
- Papel granular por location (hoje é OWNER/ADMIN do tenant inteiro).
- `audit_logs` de mudança em `tenants`/`tenant_memberships`/`locations`
  — cai naturalmente quando o módulo de auditoria (seção 8) for
  implementado.
- Projeto Supabase remoto — essas migrations foram testadas contra
  Postgres real via PGlite (WASM, sem Docker disponível no ambiente),
  não contra `supabase start` nem um projeto na nuvem. Aplicar de
  verdade é uma etapa futura que depende da conta do usuário.

## 2. CRM — Clientes e Veículos

```sql
create table customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  email        text,
  phone        text,
  locale       text not null default 'en',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index idx_customers_tenant on customers (tenant_id);

create table vehicles (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  make         text not null,
  model        text not null,
  year         int not null,
  color        text,
  vin          text,
  plate        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_vehicles_tenant on vehicles (tenant_id);
create index idx_vehicles_customer on vehicles (customer_id);
```

## 3. Orçamento

```sql
create table quotes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  customer_id         uuid not null references customers(id),
  vehicle_id          uuid not null references vehicles(id),
  status              text not null default 'PENDING' check (status in
                        ('PENDING','IN_REVIEW','QUOTED','APPROVED',
                         'REJECTED','EXPIRED','CANCELLED')),
  service_category    text not null,   -- COLLISION_REPAIR | PAINT_JOB | ...
  damage_description  text not null,
  estimated_price     numeric(10,2),
  estimated_days      int,
  shop_notes          text,
  quote_expires_at    timestamptz,
  access_token        uuid not null default gen_random_uuid(),  -- portal do cliente
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index idx_quotes_access_token on quotes (access_token);
create index idx_quotes_tenant_status on quotes (tenant_id, status);

create table quote_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  quote_id      uuid not null references quotes(id) on delete cascade,
  description   text not null,
  quantity      int not null default 1,
  unit_price    numeric(10,2) not null,
  total_price   numeric(10,2) not null
);
create index idx_quote_items_tenant on quote_items (tenant_id);

create table quote_photos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  quote_id     uuid not null references quotes(id) on delete cascade,
  storage_path text not null,     -- Supabase Storage, bucket tenant-scoped
  size_bytes   int not null,
  mime_type    text not null,
  created_at   timestamptz not null default now()
);
create index idx_quote_photos_tenant on quote_photos (tenant_id);
```

## 4. Ordem de Serviço & Produção

```sql
create table service_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  quote_id      uuid not null references quotes(id),
  status        text not null default 'SCHEDULED' check (status in
                  ('SCHEDULED','IN_PRODUCTION','QUALITY_CHECK',
                   'READY_FOR_DELIVERY','DELIVERED','CANCELLED')),
  scheduled_at  timestamptz,
  assigned_to   uuid references auth.users(id),  -- TECHNICIAN
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_service_orders_tenant on service_orders (tenant_id);
create index idx_service_orders_assigned on service_orders (assigned_to);

create table service_order_stages (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  service_order_id  uuid not null references service_orders(id) on delete cascade,
  stage             text not null,   -- ex: "disassembly","paint","assembly","qa"
  status            text not null default 'PENDING' check (status in
                       ('PENDING','IN_PROGRESS','DONE','BLOCKED')),
  notes             text,
  started_at        timestamptz,
  completed_at      timestamptz
);
create index idx_os_stages_tenant on service_order_stages (tenant_id);
create index idx_os_stages_order on service_order_stages (service_order_id);
```

## 5. Estoque & Compras

```sql
create table inventory_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  sku           text not null,
  name          text not null,
  unit          text not null default 'un',
  quantity_on_hand numeric(12,2) not null default 0,
  reorder_point numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (tenant_id, sku)
);
create index idx_inventory_items_tenant on inventory_items (tenant_id);

create table inventory_movements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  service_order_id  uuid references service_orders(id),  -- null = ajuste manual/compra
  quantity          numeric(12,2) not null,    -- negativo = saída, positivo = entrada
  reason            text not null,             -- 'usage' | 'purchase' | 'adjustment'
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id)
);
create index idx_inv_movements_tenant on inventory_movements (tenant_id);

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  created_at timestamptz not null default now()
);
create index idx_suppliers_tenant on suppliers (tenant_id);

create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id),
  status        text not null default 'DRAFT' check (status in
                  ('DRAFT','SENT','RECEIVED','CANCELLED')),
  total_amount  numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_purchase_orders_tenant on purchase_orders (tenant_id);
```

## 6. Financeiro

```sql
create table financial_transactions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  type          text not null check (type in ('RECEIVABLE','PAYABLE')),
  status        text not null default 'PENDING' check (status in
                  ('PENDING','PAID','OVERDUE','CANCELLED')),
  amount        numeric(12,2) not null,
  due_date      date,
  paid_at       timestamptz,
  service_order_id  uuid references service_orders(id),  -- origem RECEIVABLE
  purchase_order_id uuid references purchase_orders(id), -- origem PAYABLE
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_fin_tx_tenant on financial_transactions (tenant_id);
create index idx_fin_tx_tenant_status on financial_transactions (tenant_id, status);
```

## 7. Entrega & Pós-venda

```sql
create table deliveries (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  service_order_id  uuid not null references service_orders(id),
  delivered_at      timestamptz,
  signature_url     text,   -- comprovante, Storage tenant-scoped
  created_at        timestamptz not null default now()
);
create index idx_deliveries_tenant on deliveries (tenant_id);

create table post_service_feedback (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  service_order_id  uuid not null references service_orders(id),
  rating            int not null check (rating between 1 and 5),
  comment           text,
  created_at        timestamptz not null default now()
);
create index idx_feedback_tenant on post_service_feedback (tenant_id);
```

## 8. Billing & Auditoria

```sql
create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid unique not null references tenants(id) on delete cascade,
  paddle_customer_id    text unique not null,
  paddle_subscription_id text unique not null,
  plan                  text not null,
  status                text not null,   -- trialing | active | past_due | canceled | paused
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table audit_logs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id),   -- null só pra evento de sistema
  actor_id     uuid references auth.users(id),
  actor_type   text not null,   -- 'user' | 'customer_portal' | 'system'
  action       text not null,  -- 'quote.created', 'service_order.status_changed'...
  entity_type  text not null,
  entity_id    uuid,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);
create index idx_audit_tenant_created on audit_logs (tenant_id, created_at desc);
```

## 9. AI Knowledge Base

```sql
create table ai_knowledge_base (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  title        text not null,
  content      text not null,
  embedding    vector(1536),   -- pgvector, requer extensão habilitada
  created_at   timestamptz not null default now()
);
create index idx_ai_kb_tenant on ai_knowledge_base (tenant_id);
```

---

## 10. RLS — política padrão

> Atualizado na ETAPA 03: o padrão abaixo mudou de subquery direta em
> `memberships` (v1 deste documento) para as funções `security definer`
> `is_tenant_member` / `is_tenant_admin` (seção 1) — motivo: subquery
> direta numa policy de `tenant_memberships` que consulta a própria
> `tenant_memberships` causa recursão de RLS. Tabelas futuras (seções
> 2-9) devem seguir esse padrão novo, não o antigo.

Habilitar em **toda** tabela com `tenant_id` (todas das seções 2-9,
exceto `tenants` e `tenant_memberships`, que já têm política própria —
seção 1):

```sql
alter table <tabela> enable row level security;

create policy tenant_isolation on <tabela>
  for all
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
```

Tabelas com dado financeiro sensível (`financial_transactions`) recebem
policy adicional restringindo por `role` (`public.is_tenant_admin` ou
uma função `is_tenant_finance` equivalente), detalhada quando o módulo
Financeiro entrar em implementação.

`with check` é obrigatório em toda policy `for all`/`for insert`/`for
update` — sem ele, um insert/update poderia gravar um `tenant_id`
diferente do tenant autorizado mesmo com o `using` correto de leitura.

---

## 11. O que falta (fora do escopo das seções 2-9, ainda design)

- Migrations reais das seções 2-9 (CRM, orçamento, OS, produção,
  estoque, compras, financeiro, entrega, pós-venda, billing, analytics,
  AI knowledge base) — a seção 1 (núcleo tenant/membership/location) já
  está implementada, ver lá em cima
- Policies de Storage (buckets `quote-photos`, `delivery-signatures`)
  tenant-scoped
- Seeds de desenvolvimento
- Matriz RBAC completa por tabela/ação (`SECURITY.md`)
- Projeto Supabase remoto vinculado e migrations aplicadas de verdade
  (o que existe hoje foi testado via PGlite local, não contra Supabase)
