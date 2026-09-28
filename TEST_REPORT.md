# Test Report — SNOR FUNILARIA

## ETAPA 07 — CRM de clientes e veículos

Run from `app/` on 2026-09-27:

| Check               | Result                            |
| ------------------- | --------------------------------- |
| `npm run test`      | Passed — 9 files, 75 tests        |
| `npm run lint`      | Passed                            |
| `npm run typecheck` | Passed                            |
| `npm run build`     | Passed — Next.js production build |

CRM schema and RLS tests run against PGlite. They cover tenant isolation,
role-based read/write access, cross-tenant vehicle/customer links, archived
customers, VIN uniqueness, and denial of anonymous or physical-delete access.

The app has not yet been integration-tested against a remote Supabase
project; authentication and persistence still require real project
credentials.

## ETAPA 08 — Conversas e Inbox

| Check                            | Result                            |
| -------------------------------- | --------------------------------- |
| `npm run test -- --maxWorkers=1` | Passed — 10 files, 84 tests       |
| `npm run lint`                   | Passed                            |
| `npm run typecheck`              | Passed                            |
| `npm run build`                  | Passed — Next.js production build |
| Prettier check                   | Passed                            |

Conversation migration tests run against PGlite and cover tenant-scoped
reads/writes, role restrictions, lead/conversation/message foreign keys,
agent assignment, human takeover, status changes, participant read receipts,
unread counts, and anonymous/unauthorized access. The conversation migration
was applied to the remote Supabase project on 2026-09-27.

## ETAPA 09 — AI Agent

| Check                            | Result                            |
| -------------------------------- | --------------------------------- |
| `npm run test -- --maxWorkers=1` | Passed — 12 files, 90 tests       |
| `npm run lint`                   | Passed                            |
| `npm run typecheck`              | Passed                            |
| `npm run build`                  | Passed — Next.js production build |
| Prettier check                   | Passed                            |

PGlite tests cover prompt-injection separation, per-tenant agent provisioning,
tenant isolation, unauthorized/cross-tenant access, AI activation, human
takeover, direct-RPC denial, and atomic token usage. The AI migration was
applied to the linked Supabase project on 2026-09-27; remote verification
confirmed RLS is enabled on all three AI tables and `authenticated` cannot
execute the privileged response/usage RPC. The project currently has no
tenants, so there are no tenant agents provisioned yet. The OpenAI key is not
configured in this local environment, so no live API request was made.
