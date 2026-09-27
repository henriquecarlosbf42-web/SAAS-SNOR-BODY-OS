# Development — SNOR FUNILARIA

> Criado na ETAPA 02 (fundação técnica), atualizado a cada etapa desde
> então — hoje reflete até a ETAPA 06 (banco real + auth/RBAC). Nenhum
> módulo de negócio (CRM, orçamento, ERP) implementado ainda — ver
> `ARCHITECTURE.md` pro desenho completo.

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

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (roda uma vez) |
| `npm run test:watch` | Vitest em modo watch |
| `npm run format` | Prettier aplica formatação |
| `npm run format:check` | Prettier só verifica, não altera |

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
(ignorado pelo git) e preencher com valores reais. Sem isso,
`config/env.server.ts` lança erro explicando quais variáveis faltam
(nunca loga o valor, só o nome).

## Supabase local

`supabase/migrations/` tem o schema real (tenants, memberships,
locations, settings, profiles — ver `DATABASE.md`), testado via PGlite
(`tests/db/`, sem Docker no ambiente). Projeto Supabase remoto ainda não
existe/vinculado — precisa da conta do usuário. Até lá, `app/.env.local`
tem valores **falsos** só pra `npm run build`/`dev` rodarem (o app não
funciona de verdade sem credenciais reais).

## Rotas (ETAPA 06)

- `(public)/{login,signup,forgot-password,reset-password}` — fluxo de
  conta, sem autenticação
- `auth/callback/route.ts` — troca `code` por sessão (confirmação de
  email, recovery, e futuro retorno de OAuth)
- `(app)/` — protegido: `layout.tsx` redireciona pra `/login` sem sessão;
  `page.tsx` é só um placeholder provando tenant resolution + RBAC
  funcionando, nenhuma tela de negócio
- `src/proxy.ts` — proteção de rota "de UX" (Next.js 16 renomeou
  `middleware.ts` pra `proxy.ts`) + renovação do cookie de sessão; nunca
  a única barreira (`(app)/layout.tsx` + RLS são as reais)

## O que NÃO existe ainda (por decisão, não esquecimento)

- Nenhum módulo de negócio (CRM, orçamento, OS, estoque, financeiro,
  portal do cliente).
- `server/auth/actions.ts` existe (ETAPA 06); nenhuma outra Server Action
  de negócio.
- Nenhuma integração externa configurada (`services/` vazio).
- Projeto Supabase remoto não criado — todo o código de auth (`lib/auth/`,
  `lib/supabase/{server,browser}.ts`, `server/auth/actions.ts`,
  `src/proxy.ts`) é real e passa lint/typecheck/build, mas não foi
  integration-testado contra um backend de verdade (login/cadastro/
  reset não podem ser clicados de ponta a ponta ainda). A lógica de
  autorização em si (tenant resolution + RBAC) é testada com fakes —
  ver `tests/lib/auth/`.
- `lib/supabase/admin.ts` (`service_role`) ainda não existe — só entra
  quando um webhook/Edge Function precisar.
- Google/Microsoft: código pronto (`signInWithOAuth`), mas precisa ser
  habilitado no painel do projeto Supabase real pra funcionar. MFA: não
  implementado (nem UI de enrollment, nem checagem de AAL no login) —
  só "não bloqueado arquiteturalmente" (Supabase Auth suporta nativamente
  quando chegar a hora).
