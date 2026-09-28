# Development — SNOR FUNILARIA

> Criado na ETAPA 02 (fundação técnica), atualizado até a ETAPA 09
> (núcleo do agente de IA). Orçamentos e demais módulos ERP ainda não
> foram implementados — ver `ARCHITECTURE.md` pro desenho completo.

---

## Onde o código vive

`projetos/SNOR FUNILARIA/app/` — esse é o diretório raiz do projeto Next.js
(onde está o `package.json`). Todo comando abaixo roda de dentro dele.

## Stack instalada

- Next.js 16 (App Router, Turbopack)
- TypeScript (`strict: true`)
- Tailwind CSS v4
- ESLint (`eslint-config-next` + `eslint-config-prettier`, sem conflito de
  regra de formatação)
- Prettier (+ `prettier-plugin-tailwindcss`, ordena classes automaticamente)
- Vitest (testes unitários)
- Zod (validação de ambiente)
- `server-only` (trava de build contra secret vazando pro client)

## Scripts

| Comando                | O que faz                          |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Sobe o servidor de desenvolvimento |
| `npm run build`        | Build de produção                  |
| `npm run start`        | Roda o build de produção           |
| `npm run lint`         | ESLint                             |
| `npm run typecheck`    | `tsc --noEmit`                     |
| `npm run test`         | Vitest (roda uma vez)              |
| `npm run test:watch`   | Vitest em modo watch               |
| `npm run format`       | Prettier aplica formatação         |
| `npm run format:check` | Prettier só verifica, não altera   |

Antes de considerar uma etapa pronta: `lint` + `typecheck` + `test` +
`build` todos passando (regra do `CLAUDE.md`, seção "Regras de
desenvolvimento").

## Estrutura de pastas

```
app/
├── src/
│   ├── app/            # Next.js App Router — rotas (público + autenticado)
│   ├── components/     # UI reutilizável, agnóstica de domínio
│   ├── features/       # UI específica de cada módulo de negócio
│   ├── hooks/          # React hooks genéricos
│   ├── types/          # tipos compartilhados entre módulos
│   ├── config/         # env.public.ts / env.server.ts
│   ├── server/         # Server Actions (camada fina, uma por módulo)
│   ├── services/       # clients dos serviços externos (OpenAI, Resend...)
│   └── lib/
│       ├── auth/        # sessão, tenant resolution, RBAC
│       ├── supabase/    # clients (server / browser / admin)
│       ├── domains/     # regra de negócio pura, por módulo
│       ├── integrations/# helpers compartilhados entre services/
│       └── db/          # tipos gerados do schema Supabase
├── tests/               # testes (unitário/integração)
├── supabase/            # projeto local da Supabase CLI (config, migrations)
├── .env.example
└── package.json
```

Cada pasta vazia tem um `README.md` explicando sua fronteira — ler antes
de criar o primeiro arquivo ali, pra não misturar responsabilidade (ex.:
lógica de negócio não entra em `components/`; query direta ao banco não
entra em `features/`).

## Separação client / server / domínio

- **client**: `components/`, `features/*/components`, `hooks/` — nunca
  importam `server-only`, nunca tocam Supabase diretamente.
- **server**: `server/`, `services/`, `config/env.server.ts`,
  `lib/supabase/admin.ts` — sempre importam `server-only` no topo do
  arquivo; isso faz o **build falhar** (erro de compilação, não warning)
  se algum Client Component importar esse código, mesmo sem querer.
- **domínio**: `lib/domains/<modulo>/` — regra de negócio pura, sem
  saber se quem chamou foi uma Server Action, um webhook ou um teste.
- **database**: `lib/supabase/`, `lib/db/types.ts`, `supabase/migrations/`.

## Aliases

`@/*` aponta pra `src/*` (configurado em `tsconfig.json` e espelhado em
`vitest.config.mts`). Import de dentro de `src/` sempre usa `@/...`, nunca
caminho relativo longo tipo `../../../lib/...`.

## Ambiente

`.env.example` documenta toda variável, dividida em três blocos —
**nunca mover uma variável de bloco sem checar `SECURITY.md` seção 3**:

- **PUBLIC** (`NEXT_PUBLIC_*`): vai pro bundle do client. Só o que é
  seguro qualquer usuário ver no DevTools.
- **SERVER_ONLY**: lida só em `config/env.server.ts` (e por consequência,
  só em código que importa esse módulo — Server Actions, Route Handlers,
  Edge Functions).
- **SECRET**: mesmo grupo técnico do SERVER_ONLY, mas rotacionar
  imediatamente se vazar (dá acesso privilegiado: `service_role`, assina
  webhook).

Pra desenvolver localmente: copiar `.env.example` pra `.env.local`
(ignorado pelo git) e preencher com valores reais. `OPENAI_API_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são usadas somente no servidor; sem elas, o
app impede ativar AI e não tenta chamar a OpenAI. A chave service-role só
é usada na RPC estreita que grava resposta e usage.

## Supabase local e remoto

`supabase/migrations/` é testado via PGlite (`tests/db/`, sem Docker no
ambiente). O projeto remoto `SAAS-SNOR-BODY-OS` está vinculado; migrations
de núcleo, CRM, conversas e AI Agent foram aplicadas. A migration do AI
Agent provisiona automaticamente um agente quando um tenant for criado;
no momento ainda não há tenants registrados nesse projeto remoto.

## Rotas (ETAPA 09)

- `(public)/{login,signup,forgot-password,reset-password}` — fluxo de
  conta, sem autenticação
- `auth/callback/route.ts` — troca `code` por sessão (confirmação de
  email, recovery, e futuro retorno de OAuth)
- `(app)/` — protegido: `layout.tsx` redireciona pra `/login` sem sessão;
  contém CRM (`/customers`, `/vehicles`), Inbox (`/inbox`), configuração do
  agente (`/settings/ai-agent`) e a home inicial, ainda placeholder
- `src/proxy.ts` — proteção de rota "de UX" (Next.js 16 renomeou
  `middleware.ts` pra `proxy.ts`) + renovação do cookie de sessão; nunca
  a única barreira (`(app)/layout.tsx` + RLS são as reais)

## Estado atual e o que ainda NÃO existe

- CRM (ETAPA 07), conversas/Inbox (ETAPA 08) e núcleo do agente de IA
  (ETAPA 09) estão implementados. O fluxo de entrada atual é autenticado
  para membros da oficina; portal público, Twilio e webhooks não fazem
  parte desta etapa.
- A chamada OpenAI é server-only. Configure `OPENAI_API_KEY` no ambiente
  do servidor antes de habilitar o AI Agent.
- A migration de IA foi aplicada ao Supabase remoto. Antes de gerar
  respostas, configure `OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no
  ambiente seguro do servidor; não envie essas chaves pelo chat.
- Orçamentos, OS, estoque, financeiro e portal do cliente ainda não existem.
- Google/Microsoft: código pronto (`signInWithOAuth`), mas precisa ser
  habilitado no painel do projeto Supabase real pra funcionar. MFA: não
  implementado (nem UI de enrollment, nem checagem de AAL no login) —
  só "não bloqueado arquiteturalmente" (Supabase Auth suporta nativamente
  quando chegar a hora).
