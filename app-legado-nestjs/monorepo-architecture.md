# Arquitetura do Monorepo — BodyQuote SaaS

> Estratégia: **monorepo com Turborepo** — frontend + backend no mesmo repositório, compartilhando tipos TypeScript

---

## Estrutura de pastas

```
bodyquote/
├── apps/
│   ├── web/                        # Next.js 14 — frontend (dashboard + portal público)
│   │   ├── app/
│   │   │   ├── (auth)/             # rotas de login/signup
│   │   │   ├── (dashboard)/        # painel da funilaria (autenticado)
│   │   │   │   ├── quotes/
│   │   │   │   ├── appointments/
│   │   │   │   ├── services/
│   │   │   │   ├── settings/
│   │   │   │   └── layout.tsx
│   │   │   ├── shop/[slug]/        # portal público da funilaria
│   │   │   │   ├── page.tsx        # landing da funilaria
│   │   │   │   └── quote/
│   │   │   │       └── new/        # formulário de solicitação de orçamento
│   │   │   ├── api/                # API routes (webhooks Stripe, Clerk, etc.)
│   │   │   │   ├── webhooks/
│   │   │   │   │   ├── stripe/
│   │   │   │   │   └── clerk/
│   │   │   │   └── trpc/           # opcional: tRPC handler
│   │   │   ├── layout.tsx          # root layout com next-intl
│   │   │   └── globals.css
│   │   ├── messages/               # arquivos de tradução (i18n)
│   │   │   ├── en.json             ← fonte da verdade
│   │   │   ├── es.json
│   │   │   ├── pt.json
│   │   │   └── fr.json
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui base components
│   │   │   ├── quotes/             # componentes específicos de quotes
│   │   │   ├── appointments/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── auth.ts             # helpers Clerk
│   │   │   ├── db.ts               # cliente Prisma singleton
│   │   │   └── utils.ts
│   │   ├── middleware.ts            # Clerk auth + RLS context + i18n routing
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── api/                        # NestJS — API REST dedicada (lógica pesada)
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/
│       │   │   ├── guards/          # AuthGuard, TenantGuard, SubscriptionGuard
│       │   │   ├── decorators/      # @CurrentShop(), @CurrentUser()
│       │   │   ├── filters/         # GlobalExceptionFilter
│       │   │   ├── interceptors/    # LoggingInterceptor, AuditInterceptor
│       │   │   └── middleware/      # RateLimitMiddleware, TenantContextMiddleware
│       │   ├── modules/
│       │   │   ├── auth/            # integração Clerk
│       │   │   ├── shops/           # CRUD de funilarias
│       │   │   ├── quotes/          # core: criar, listar, atualizar quotes
│       │   │   ├── appointments/    # agendamentos
│       │   │   ├── uploads/         # upload de fotos → R2
│       │   │   ├── notifications/   # emails via Resend
│       │   │   ├── subscriptions/   # Stripe webhooks + verificação de plano
│       │   │   └── audit/           # registro de audit logs
│       │   └── prisma/
│       │       └── prisma.service.ts
│       └── package.json
│
├── packages/
│   ├── database/                   # schema Prisma + cliente compartilhado
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   └── index.ts            # re-exporta PrismaClient tipado
│   │   └── package.json
│   │
│   ├── types/                      # tipos TypeScript compartilhados
│   │   ├── src/
│   │   │   ├── quote.types.ts
│   │   │   ├── shop.types.ts
│   │   │   ├── appointment.types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── validations/                # schemas Zod compartilhados (frontend + backend)
│   │   ├── src/
│   │   │   ├── quote.schema.ts
│   │   │   ├── shop.schema.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── email-templates/            # templates React Email
│       ├── src/
│       │   ├── quote-received.tsx
│       │   ├── quote-sent.tsx
│       │   ├── appointment-confirmed.tsx
│       │   └── index.ts
│       └── package.json
│
├── infra/                          # IaC e configs de deploy
│   ├── docker-compose.yml          # dev local (Postgres + Redis)
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── railway.json                # config de deploy Railway
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # lint + typecheck + tests em PRs
│       └── deploy.yml              # deploy automático na main
│
├── turbo.json                      # config Turborepo
├── package.json                    # root (workspaces)
├── pnpm-workspace.yaml
├── .env.example                    # NUNCA commitar .env real
└── tsconfig.base.json              # tsconfig compartilhado
```

---

## Fluxo de dados entre apps

```
[Browser]
    │
    ├─ /shop/[slug]/*   → Next.js web (SSR público, sem auth)
    │
    └─ /dashboard/*     → Next.js web (autenticado via Clerk)
                                │
                                ├─ Server Actions / Route Handlers
                                │         ↓
                                │    packages/database (Prisma + RLS)
                                │         ↓
                                │    PostgreSQL
                                │
                                └─ Chamadas REST → apps/api (NestJS)
                                                        │
                                              ┌─────────┴──────────┐
                                           Stripe              Resend/R2
```

---

## Variáveis de ambiente (.env.example)

```bash
# Database
DATABASE_URL="postgresql://bodyquote_app:senha@localhost:5432/bodyquote_dev"

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...

# Email (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM="BodyQuote SaaS <noreply@bodyquote.com>"

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=bodyquote-uploads
R2_PUBLIC_URL=https://uploads.bodyquote.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
API_URL=http://localhost:3001
NODE_ENV=development
```

---

## Guards e segurança na API (NestJS)

Todo endpoint da API passa pelos seguintes guards em ordem:

```
Request
  → RateLimitGuard      (100 req/min por IP nas rotas públicas)
  → AuthGuard           (valida JWT do Clerk)
  → TenantContextMiddleware  (seta app.current_shop_id no Prisma session)
  → TenantGuard         (verifica shop_id do token == shop_id da rota)
  → SubscriptionGuard   (verifica se o plano permite a ação)
  → Controller Handler
  → AuditInterceptor    (loga ação crítica ao final)
```

---

## Scripts principais

```json
// turbo.json pipeline
{
  "pipeline": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev":       { "cache": false, "persistent": true },
    "lint":      {},
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["^build"] },
    "db:migrate":{ "cache": false },
    "db:seed":   { "cache": false }
  }
}
```

```bash
# Comandos do dia a dia
pnpm dev              # sobe web + api em paralelo
pnpm build            # build completo
pnpm lint             # lint em todos os packages
pnpm typecheck        # typecheck em todos os packages
pnpm db:migrate       # roda migrations Prisma
pnpm db:seed          # seed de dados de dev
pnpm db:studio        # abre Prisma Studio
```
