# Security — SNOR FUNILARIA

> v2 — 2026-09-27 (ETAPA 05). Detalha como as regras absolutas do
> `CLAUDE.md` se aplicam nos pontos concretos definidos em
> `ARCHITECTURE.md` e `DATABASE.md`. Atualizar conforme cada módulo for
> implementado. Seção 1B é nova nesta etapa — RLS do núcleo
> (tenant/membership/location) agora com as 4 operações (SELECT/INSERT/
> UPDATE/DELETE) explicitamente cobertas por policy e testadas.

---

## 1. Matriz RBAC por módulo

Convenção: **R** leitura, **W** escrita/edição, **A** aprovar/mudar
status crítico, `—` sem acesso. RLS é a barreira real; essa matriz é o
que a camada de app (`can()`/`requirePermission`, `lib/auth/permissions.ts`
e `rbac.ts` — implementados na ETAPA 06) e a UI devem espelhar.

| Módulo | OWNER | ADMIN | MANAGER | SALES | ESTIMATOR | TECHNICIAN | FINANCE | VIEWER |
|---|---|---|---|---|---|---|---|---|
| CRM (clientes/veículos) | RWA | RW | RW | RW | R | — | R | R |
| Orçamento | RWA | RW | RW | RW | RW | — | R | R |
| Aprovação de orçamento | RWA | RW | RW | RW | — | — | — | R |
| Ordem de Serviço | RWA | RW | RW | R | R | R (só a própria) | — | R |
| Produção (stages) | RWA | RW | RW | — | — | RW (só a própria OS) | — | R |
| Estoque | RWA | RW | RW | — | — | R | R | R |
| Compras | RWA | RW | RW | — | — | — | RW | R |
| Financeiro | RWA | RW | R | — | — | — | RW | R |
| Entrega | RWA | RW | RW | R | — | R | — | R |
| Pós-venda | RWA | RW | RW | R | — | — | — | R |
| Billing (assinatura do tenant) | RWA | — | — | — | — | — | — | — |
| Membros/convites do tenant | RWA | R | — | — | — | — | — | — |
| Configurações do tenant | RWA | RW | — | — | — | — | — | — |

> Corrigido na ETAPA 06: "Membros/convites" tinha ADMIN=RW aqui, mas a
> RLS de `tenant_memberships` (implementada e testada desde a ETAPA 03,
> só `is_tenant_owner` escreve) e o texto logo abaixo desta tabela sempre
> disseram OWNER-only. A tabela é que estava errada — corrigida pra
> ADMIN=R, batendo com o código real (`lib/auth/permissions.ts`).

Notas:
- **TECHNICIAN** só enxerga OS/produção onde `service_orders.assigned_to
  = auth.uid()` — isso é regra de RLS (linha adicional na policy da
  tabela, além do `tenant_id`), não só filtro de UI.
- **FINANCE** não edita OS/produção mesmo tendo acesso de leitura amplo —
  separação intencional pra reduzir superfície de erro/fraude.
- **VIEWER** nunca escreve em nada — papel pra contador externo, auditor,
  consultor.
- Convite de novo membro e mudança de role só por **OWNER** (nunca um
  ADMIN promove alguém a OWNER — evita escalação lateral).

---

## 1B. RLS — policies implementadas (núcleo tenant/membership/location)

> Implementado na ETAPA 03, completado na ETAPA 05. Migrations em
> `app/supabase/migrations/`. Nenhuma linha de código de aplicação decide
> isolamento — é sempre a policy do Postgres. Nenhuma policy usa
> `service_role` como atalho: todo bootstrap (criar tenant, criar
> settings, criar location principal, criar profile no signup) passa por
> função `SECURITY DEFINER` estreita, nunca por dar `service_role` pro
> client ou por desabilitar RLS.

Convenção: **member** = `public.is_tenant_member(tenant_id)`, **admin** =
`public.is_tenant_admin(tenant_id)` (OWNER/ADMIN), **owner** =
`public.is_tenant_owner(tenant_id)`. `false` = negado pra qualquer
`authenticated`/`anon`, só acontece via função `SECURITY DEFINER`
(bypassa RLS por rodar como dono da tabela).

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | própria linha (`id = auth.uid()`) | `false` (trigger `handle_new_user`) | própria linha | `false` |
| `tenants` | member | `false` (função `create_tenant_with_owner`) | admin | `false` |
| `tenant_memberships` | própria linha OU admin do tenant | owner | owner | owner |
| `tenant_settings` | member | `false` (trigger `handle_new_tenant`) | admin | `false` |
| `locations` | member | admin | admin | admin |

Garantias verificadas por teste automatizado (não só design) em
`tests/db/rls-isolation.test.ts` — 21 testes, rodando como `authenticated`
e `anon` de verdade (nunca `service_role`), contra Postgres real (PGlite,
sem Docker disponível no ambiente — mesma ressalva de `DATABASE.md`):

- Tenant A nunca lê, altera, insere ou apaga dado de Tenant B — nas 5
  tabelas.
- Usuário sem autenticação (`anon`, sem JWT) não lê/escreve nada em
  nenhuma das 5 tabelas, incluindo tentar chamar `create_tenant_with_owner`
  diretamente (a função também checa `auth.uid() is null` internamente —
  duas camadas, RLS + checagem explícita).
- `profiles`/`tenants`/`tenant_settings`: nem o dono legítimo consegue
  inserir/apagar direto — só os fluxos automáticos (trigger/função
  `SECURITY DEFINER`) fazem isso.

**Diferença de comportamento entre INSERT e UPDATE/DELETE negados:**
`with check (false)` (insert) faz o Postgres **levantar erro**
("new row violates row-level security policy"); `using (false)`
(update/delete) só torna a linha invisível pra aquela operação —
resultado é **0 linhas afetadas, sem erro**. Os dois são "acesso
negado", só se manifestam diferente — testes de update/delete checam
`affectedRows === 0`, testes de insert checam que a Promise rejeita.

---

## 2. Portal do cliente — `access_token`

O cliente final não tem conta (`auth.uid()` não existe pra ele), então o
RLS padrão não protege essas rotas. Controles obrigatórios:

1. `access_token` é `uuid` gerado por `gen_random_uuid()` — não
   sequencial, não derivável a partir do id do quote/OS.
2. Toda leitura/escrita do portal passa por uma função server-only que:
   - recebe o token pela URL, nunca por header customizado incluído em
     log;
   - busca o registro por `access_token`, nunca por `id` + token separado
     (evita IDOR combinando um id adivinhado com token errado);
   - **nunca** usa `service_role` diretamente a partir de input do
     cliente sem essa checagem — a função valida o token primeiro, só
     depois busca dados relacionados (fotos, itens, OS) já filtrando por
     `quote_id`/`tenant_id` do registro validado, não por valores vindos
     da requisição.
3. Rate limiting por IP e por token nas rotas do portal (mitiga
   brute-force de token e scraping).
4. Token não expõe outros registros do mesmo cliente/tenant — cada quote
   tem o seu; não existe um "token mestre" por cliente.
5. Expiração: token do portal fica inválido `N` dias após a OS ser
   `DELIVERED` (valor exato a decidir na implementação; não deixar
   permanente).
6. Ações que alteram estado (aprovar orçamento, confirmar agendamento)
   feitas pelo portal geram `audit_logs` com `actor_type = 'customer_portal'`.

---

## 3. Secrets

| Secret | Onde vive | Nunca |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Env var server-only (Vercel/Edge Function) | No client, no repo, em log |
| `SUPABASE_ANON_KEY` | Pode ir ao client (é pública por design, mas RLS é quem protege) | — |
| `OPENAI_API_KEY` | Env var server-only | No client, no repo |
| `RESEND_API_KEY` | Env var server-only | No client, no repo |
| `TWILIO_AUTH_TOKEN` | Env var server-only | No client, no repo |
| `PADDLE_API_KEY` / webhook secret | Env var server-only | No client, no repo |
| `GOOGLE_CALENDAR` client secret / refresh tokens | Env var / tabela criptografada por tenant | No client, no repo, sem criptografia em repouso |
| `POSTHOG` key | Pública (client-side por design do PostHog) | — |

Regras gerais:
- `.env.example` no repo com nomes de variável e descrição, nunca valor
  real.
- Nenhum secret em `console.log`/logger — revisar antes de mergear
  qualquer log novo que toque em payload de webhook ou header de auth.
- `service_role` do Supabase só é importável em arquivos marcados
  `server-only` (`lib/supabase/admin.ts`), nunca em Client Components.

---

## 4. Webhooks

| Provider | Validação de assinatura | Idempotência |
|---|---|---|
| Paddle | Verificar assinatura do webhook (chave pública Paddle) antes de processar | Guardar `paddle_event_id` processado; ignorar repetição |
| Twilio | Validar `X-Twilio-Signature` | Guardar `MessageSid`/`CallSid` processado |
| Google Calendar | Validar `channel token` do push notification | Guardar `resourceId` + `X-Goog-Message-Number` processado |

Todo handler de webhook: responde 2xx rápido, processa de forma
idempotente (upsert por id do evento, não insert cego), e nunca confia
no `tenant_id` que porventura venha no payload sem cruzar com o
registro correspondente já existente no banco (ex.: `paddle_customer_id`
→ busca `subscriptions` → deriva `tenant_id` do banco, não do payload).

---

## 5. Erros e respostas de API

- Nunca retornar stack trace pro cliente — logar server-side (Vercel
  logs/Sentry quando configurado), responder mensagem genérica.
- Nunca incluir nome de tabela, nome de coluna, ou detalhe de query em
  mensagem de erro voltada ao usuário.
- Erros de autorização (RLS bloqueando, `requireRole` falhando) retornam
  404 quando o recurso não deveria nem parecer existir pra quem não tem
  acesso (evita confirmar existência de dado de outro tenant), e 403
  quando faz sentido confirmar que o recurso existe mas o usuário não
  pode agir nele (ex.: TECHNICIAN vendo status "sem permissão" numa OS
  que não é dele, dentro do próprio tenant).

---

## 6. IA — proteção contra prompt injection

Reforçando `ARCHITECTURE.md` seção 7:

- System prompt fixo, versionado em código (`lib/domains/ai/prompts.ts`),
  nunca montado concatenando string vinda de tenant/cliente.
- Conteúdo do formulário do cliente e resultados de RAG (Knowledge Base)
  entram como **dado** em um campo estruturado (ex.: `context: string`),
  nunca colado dentro do texto da instrução do sistema.
- A IA nunca recebe permissão de executar ação (criar OS, aprovar
  orçamento, mudar preço) diretamente — ela só sugere/preenche rascunho;
  toda ação que persiste dado passa pelas mesmas Server Actions com
  `requireRole`, como se fosse um humano preenchendo o formulário.

---

## 7. Upload de arquivos (fotos, comprovantes)

- Validar mime-type e tamanho no servidor antes de gravar no Storage
  (não confiar só no `accept` do `<input>`).
- Buckets do Supabase Storage com policy tenant-scoped (path prefixado
  por `tenant_id`, policy de Storage confere isso, igual RLS de tabela).
- Nomes de arquivo gerados pelo servidor (uuid), nunca o filename
  original do usuário usado como path (evita path traversal / colisão).

---

## 8. Auditoria — ações que sempre geram `audit_logs`

- Criação/edição de orçamento e mudança de status
- Aprovação/rejeição de orçamento (inclusive pelo portal do cliente)
- Criação de OS e mudança de estágio de produção
- Movimentação de estoque
- Lançamento/baixa financeira
- Convite/remoção de membro, mudança de role
- Login (sucesso e falha, sem senha nem token em `metadata`)

---

## 9. O que falta

- Threat model completo por módulo conforme forem implementados
- Definição do prazo exato de expiração do `access_token` do portal
- Decisão sobre 2FA para papéis sensíveis (OWNER/FINANCE) — avaliar
  quando Auth for implementado
