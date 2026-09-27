# Database Schema — BodyQuote SaaS

> Banco: PostgreSQL | ORM: Prisma | Estratégia multi-tenancy: RLS (Row-Level Security)

---

## Diagrama de entidades

```
shops (tenant)
  ├── shop_users          (funcionários da funilaria)
  ├── shop_subscriptions  (plano Stripe)
  ├── shop_services       (catálogo de serviços oferecidos)
  ├── shop_availability   (slots de agenda)
  └── quotes              (pedidos de orçamento)
        ├── quote_photos    (fotos do veículo)
        ├── quote_items     (itens do orçamento enviado)
        └── appointments    (agendamento aprovado)

customers (cliente final — global, não por tenant)
  └── quotes (via customer_id)
```

---

## Schema Prisma

```prisma
// ============================================================
// ENUMS
// ============================================================

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  PAUSED
}

enum SubscriptionPlan {
  STARTER
  GROWTH
  PRO
}

enum QuoteStatus {
  PENDING       // aguardando análise da funilaria
  IN_REVIEW     // funilaria está analisando
  QUOTED        // orçamento enviado ao cliente
  APPROVED      // cliente aprovou
  REJECTED      // cliente rejeitou
  EXPIRED       // expirou sem resposta
  CANCELLED     // cancelado por qualquer parte
}

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  NO_SHOW
  CANCELLED
}

enum ServiceCategory {
  COLLISION_REPAIR
  PAINT_JOB
  DENT_REMOVAL
  POLISHING
  GLASS_REPLACEMENT
  FRAME_STRAIGHTENING
  OTHER
}

enum UserRole {
  OWNER         // dono da funilaria — acesso total
  MANAGER       // gerente — acesso quase total
  ESTIMATOR     // faz orçamentos, sem acesso financeiro
  RECEPTIONIST  // agenda e atende clientes
}

// ============================================================
// SHOPS (TENANTS)
// ============================================================

model Shop {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique  // ex: "sunshine-auto" → bodyquote.com/shop/sunshine-auto
  email           String   @unique
  phone           String?
  website         String?
  address         String?
  city            String?
  state           String?
  country         String   @default("US")
  zip_code        String?
  logo_url        String?
  timezone        String   @default("America/New_York")
  default_locale  String   @default("en")  // i18n: locale padrão do portal público
  is_active       Boolean  @default(true)
  is_verified     Boolean  @default(false)

  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  // Relations
  users           ShopUser[]
  subscription    ShopSubscription?
  services        ShopService[]
  availability    ShopAvailability[]
  quotes          Quote[]
  audit_logs      AuditLog[]

  @@map("shops")
}

// ============================================================
// SHOP USERS (funcionários da funilaria)
// ============================================================

model ShopUser {
  id          String   @id @default(cuid())
  shop_id     String
  clerk_id    String   @unique  // ID do Clerk (auth provider)
  email       String
  name        String
  role        UserRole @default(ESTIMATOR)
  is_active   Boolean  @default(true)

  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  shop        Shop     @relation(fields: [shop_id], references: [id], onDelete: Cascade)

  @@index([shop_id])
  @@map("shop_users")
}

// ============================================================
// SUBSCRIPTIONS (Stripe)
// ============================================================

model ShopSubscription {
  id                     String             @id @default(cuid())
  shop_id                String             @unique
  stripe_customer_id     String             @unique
  stripe_subscription_id String             @unique
  plan                   SubscriptionPlan
  status                 SubscriptionStatus
  current_period_start   DateTime
  current_period_end     DateTime
  trial_ends_at          DateTime?
  cancel_at              DateTime?

  created_at             DateTime           @default(now())
  updated_at             DateTime           @updatedAt

  shop                   Shop               @relation(fields: [shop_id], references: [id], onDelete: Cascade)

  @@map("shop_subscriptions")
}

// ============================================================
// SHOP SERVICES (catálogo de serviços)
// ============================================================

model ShopService {
  id           String          @id @default(cuid())
  shop_id      String
  category     ServiceCategory
  name         String          // nome customizado pela funilaria
  description  String?
  is_active    Boolean         @default(true)
  sort_order   Int             @default(0)

  created_at   DateTime        @default(now())
  updated_at   DateTime        @updatedAt

  shop         Shop            @relation(fields: [shop_id], references: [id], onDelete: Cascade)
  quote_items  QuoteItem[]

  @@index([shop_id])
  @@map("shop_services")
}

// ============================================================
// SHOP AVAILABILITY (slots de agenda)
// ============================================================

model ShopAvailability {
  id           String  @id @default(cuid())
  shop_id      String
  day_of_week  Int     // 0=Sun, 1=Mon ... 6=Sat
  open_time    String  // "08:00"
  close_time   String  // "18:00"
  is_active    Boolean @default(true)

  shop         Shop    @relation(fields: [shop_id], references: [id], onDelete: Cascade)

  @@index([shop_id])
  @@map("shop_availability")
}

// ============================================================
// CUSTOMERS (clientes finais — globais)
// ============================================================

model Customer {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  phone        String?
  locale       String   @default("en")

  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  quotes       Quote[]

  @@map("customers")
}

// ============================================================
// QUOTES (pedidos de orçamento — core do sistema)
// ============================================================

model Quote {
  id              String      @id @default(cuid())
  shop_id         String      // RLS: filtro principal de tenant
  customer_id     String
  status          QuoteStatus @default(PENDING)
  reference_code  String      @unique  // ex: "BQ-2024-00042" — exibido ao cliente

  // Veículo
  vehicle_make    String      // ex: "Toyota"
  vehicle_model   String      // ex: "Camry"
  vehicle_year    Int
  vehicle_color   String?
  vehicle_vin     String?

  // Serviço solicitado
  service_category ServiceCategory
  damage_description String     @db.Text
  notes           String?       @db.Text

  // Resposta da funilaria
  estimated_price  Decimal?    @db.Decimal(10, 2)
  estimated_days   Int?
  shop_notes       String?     @db.Text
  quote_expires_at DateTime?

  // Metadados
  ip_address      String?      // segurança: log do IP que criou o pedido
  user_agent      String?

  created_at      DateTime     @default(now())
  updated_at      DateTime     @updatedAt

  // Relations
  shop            Shop         @relation(fields: [shop_id], references: [id])
  customer        Customer     @relation(fields: [customer_id], references: [id])
  photos          QuotePhoto[]
  items           QuoteItem[]
  appointment     Appointment?

  @@index([shop_id])
  @@index([customer_id])
  @@index([status])
  @@map("quotes")
}

// ============================================================
// QUOTE PHOTOS
// ============================================================

model QuotePhoto {
  id          String  @id @default(cuid())
  quote_id    String
  shop_id     String  // redundante para RLS
  url         String  // URL do R2/S3
  key         String  // chave no bucket (para deleção)
  size_bytes  Int
  mime_type   String
  sort_order  Int     @default(0)

  created_at  DateTime @default(now())

  quote       Quote    @relation(fields: [quote_id], references: [id], onDelete: Cascade)

  @@index([quote_id])
  @@index([shop_id])
  @@map("quote_photos")
}

// ============================================================
// QUOTE ITEMS (itens do orçamento)
// ============================================================

model QuoteItem {
  id           String      @id @default(cuid())
  quote_id     String
  shop_id      String      // redundante para RLS
  service_id   String?
  description  String
  quantity     Int         @default(1)
  unit_price   Decimal     @db.Decimal(10, 2)
  total_price  Decimal     @db.Decimal(10, 2)

  quote        Quote       @relation(fields: [quote_id], references: [id], onDelete: Cascade)
  service      ShopService? @relation(fields: [service_id], references: [id])

  @@index([quote_id])
  @@index([shop_id])
  @@map("quote_items")
}

// ============================================================
// APPOINTMENTS (agendamentos)
// ============================================================

model Appointment {
  id           String            @id @default(cuid())
  quote_id     String            @unique
  shop_id      String            // RLS
  scheduled_at DateTime
  duration_min Int               @default(60)
  status       AppointmentStatus @default(SCHEDULED)
  notes        String?

  created_at   DateTime          @default(now())
  updated_at   DateTime          @updatedAt

  quote        Quote             @relation(fields: [quote_id], references: [id])

  @@index([shop_id])
  @@index([scheduled_at])
  @@map("appointments")
}

// ============================================================
// AUDIT LOG (ações críticas — imutável)
// ============================================================

model AuditLog {
  id          String   @id @default(cuid())
  shop_id     String?
  actor_id    String?  // shop_user ID ou "system"
  actor_type  String   // "shop_user" | "customer" | "system"
  action      String   // ex: "quote.created", "quote.status_changed", "user.login"
  entity_type String   // ex: "Quote", "Appointment"
  entity_id   String?
  metadata    Json?    // dados extras (ex: { from: "PENDING", to: "QUOTED" })
  ip_address  String?

  created_at  DateTime @default(now())

  shop        Shop?    @relation(fields: [shop_id], references: [id])

  @@index([shop_id])
  @@index([action])
  @@index([created_at])
  @@map("audit_logs")
}
```

---

## Políticas de Row-Level Security (RLS)

Scripts SQL a aplicar após `prisma migrate`:

```sql
-- Habilitar RLS nas tabelas com dados de tenant
ALTER TABLE shop_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;

-- Política padrão: acesso apenas ao próprio tenant
-- (app define current_setting via SET app.current_shop_id = '<id>')

CREATE POLICY tenant_isolation ON quotes
  USING (shop_id = current_setting('app.current_shop_id')::text);

CREATE POLICY tenant_isolation ON shop_users
  USING (shop_id = current_setting('app.current_shop_id')::text);

-- Repetir para todas as tabelas com shop_id...

-- Role de aplicação (nunca usa superuser em runtime)
CREATE ROLE bodyquote_app LOGIN PASSWORD 'trocar_em_prod';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bodyquote_app;
```

---

## Índices de performance

```sql
-- Busca de quotes por status dentro de um tenant (query mais frequente)
CREATE INDEX idx_quotes_shop_status ON quotes (shop_id, status);

-- Agenda: busca por data dentro do tenant
CREATE INDEX idx_appointments_shop_date ON appointments (shop_id, scheduled_at);

-- Audit: busca por período
CREATE INDEX idx_audit_shop_created ON audit_logs (shop_id, created_at DESC);
```

---

## Limites por plano (enforced na API)

| Recurso | Starter | Growth | Pro |
|---------|---------|--------|-----|
| Quotes/mês | 30 | ilimitado | ilimitado |
| Usuários do painel | 1 | 3 | ilimitado |
| Fotos por quote | 5 | 10 | 10 |
| Retenção histórico | 6 meses | 2 anos | ilimitado |
