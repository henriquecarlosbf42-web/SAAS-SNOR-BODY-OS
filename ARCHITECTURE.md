# ARCHITECTURE.md — SNOR FUNILARIA

> ETAPA 01 — 2026-09-27. Arquitetura técnica completa (documentação).
> Substitui a v1 anterior deste arquivo, que cobria só um subconjunto.
> Detalhe de schema SQL vive em `DATABASE.md`; detalhe de controles de
> segurança vive em `SECURITY.md` — aqui eles são referenciados, não
> duplicados por inteiro. Este documento começou como desenho; o estado
> atualizado das funcionalidades aparece abaixo.
>
> Atualizado na ETAPA 07: CRM de clientes e veículos implementado em
> `app/src/`; os demais módulos continuam no desenho.
> Atualizado na ETAPA 09: núcleo do AI Agent multi-tenant implementado;
> portal público, Twilio e webhooks permanecem fora do escopo.

---

## 1. Visão geral do sistema

SNOR FUNILARIA é um SaaS B2B multi-tenant pra oficinas de funilaria e
pintura automotiva (auto body shops), mercado inicial EUA/Europa. Um
único app Next.js na Vercel, backend Supabase (Postgres + Auth +
Storage + Edge Functions), sem serviço backend separado.

```
┌───────────────────────────────────────────────────────────┐
│                      Next.js (Vercel)                      │
│                                                              │
│   Painel da Oficina (autenticado)   Portal do Cliente        │
│   /app/*                            /p/[tenantSlug]/*        │
│                                                              │
│   Server Actions / Route Handlers                           │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────┐
│                        Supabase                             │
│  Postgres + RLS   |   Auth   |   Storage   |  Edge Functions │
└───────────────────────────────────────────────────────────┘
                          │
                          ▼
        OpenAI · Resend · Twilio · Google Calendar · Paddle · PostHog
```

Dois públicos, duas superfícies:

- **Oficina** (OWNER…VIEWER): opera o pipeline completo do negócio.
- **Cliente final**: só interage via Portal do Cliente, sem conta,
  acesso por link com token (seção 20).

---

## 2. Arquitetura frontend

- Next.js App Router, TypeScript, Tailwind CSS.
- Dois route groups: `(app)` autenticado e `(public)` (portal + login/
  signup + landing).
- Server Components por padrão; Client Components só onde há
  interatividade real (formulários, upload de foto, tabelas com filtro
  client-side).
- Toda leitura de dado sensível acontece em Server Component/Server
  Action — o client nunca recebe mais dado do que a tela precisa
  renderizar (evita vazar campo de outro tenant/role por engano num
  payload genérico).
- Estado de sessão (tenant ativo, role) resolvido no `layout.tsx` do
  route group `(app)` e passado via contexto de servidor, não guardado
  em `localStorage` como fonte de verdade (client pode ler pra UX, nunca
  pra decisão de autorização).
- i18n preparado (`next-intl`), EN como locale padrão do produto.

---

## 3. Arquitetura backend

Não existe backend separado (decisão registrada na v1, mantida). "Backend"
= Server Actions e Route Handlers dentro do próprio Next.js, mais Edge
Functions do Supabase para o que não pode rodar no runtime do Next
(processamento de webhook que precisa responder rápido e independente de
cold start do Next, geração de embeddings da Knowledge Base).

Toda função de backend recebe contexto de sessão já resolvido
(`tenantId`, `userId`, `role` — seção 11) e nunca aceita `tenant_id`
como parâmetro de entrada vindo do client pra decidir autorização
(regra absoluta nº 1/2 do `CLAUDE.md`).

Camadas (mesma separação da v1, mantida):

```
lib/
├── auth/        → sessão, tenant, RBAC
├── supabase/     → clients (server/browser/admin)
├── domains/      → regra de negócio por módulo (12–20)
├── integrations/ → clients dos serviços externos (23)
└── db/           → tipos gerados do schema
```

Data access for business modules lives in `server/<module>/data.ts`
(`server-only`); Server Actions authorize and validate before calling it.

---

## 4. Supabase

Papel do Supabase no sistema: banco (Postgres), identidade (Auth),
arquivos (Storage) e execução de webhook (Edge Functions). Não é
"backend genérico" — a lógica de negócio fica em `lib/domains/`, o
Supabase resolve persistência, isolamento (RLS) e identidade.

- **Postgres**: fonte de verdade única, ver seção 5.
- **Auth**: gerencia usuários da oficina (`auth.users`); cliente final
  **não** tem usuário Auth (seção 20).
- **Storage**: buckets tenant-scoped (seção 9).
- **Edge Functions**: usadas só quando o Next não é adequado (webhook
  que precisa de latência previsível/isolamento de execução, jobs de
  embedding da IA). Todo uso de `service_role` dentro de uma Edge
  Function é justificado e documentado no próprio arquivo da function.

---

## 5. PostgreSQL

Um único banco, schema compartilhado (`shared database + shared schema`),
isolamento por `tenant_id` + RLS — não schema-per-tenant, não
database-per-tenant. Motivo: volume esperado (dezenas/centenas de
oficinas, não milhares na largada) não justifica a complexidade
operacional de milhares de schemas; RLS dá isolamento equivalente com
uma superfície de manutenção muito menor.

Convenções (detalhadas em `DATABASE.md`): `uuid` como PK, `tenant_id`
em toda tabela tenant-scoped, `created_at`/`updated_at` em tudo,
`deleted_at` (soft delete) onde exclusão física seria perigosa,
migrations versionadas (`supabase/migrations/*.sql`, ainda não criadas
— etapa de implementação futura).

---

## 6. Multi-tenancy

Estratégia: **Shared Database + Shared Schema + `tenant_id` + RLS +
RBAC**. Cada oficina é um `tenant` (tabela `tenants`). Um usuário se
relaciona com um ou mais tenants via `memberships` (`tenant_id`,
`user_id`, `role`).

Regra inegociável: **nunca confiar em `tenant_id` vindo do frontend**.
O tenant efetivo de cada operação vem sempre de:

```
auth.uid() (JWT validado pelo Supabase Auth)
   → memberships (busca no banco, não em claim do token)
   → tenant_id + role
```

Detalhe completo do fluxo: seção "Fluxo de tenant resolution" mais
abaixo.

---

## 7. RLS

Toda tabela tenant-scoped tem RLS habilitado, com a policy padrão:

```sql
using (tenant_id in (select tenant_id from memberships
                      where user_id = auth.uid() and is_active))
with check (tenant_id in (select tenant_id from memberships
                           where user_id = auth.uid() and is_active))
```

`with check` é obrigatório em toda policy de escrita — sem ele um
insert/update poderia gravar `tenant_id` de outro tenant mesmo com
leitura corretamente restrita. Exceções e políticas adicionais (ex.:
`service_orders` restrito também por `assigned_to` pra TECHNICIAN) estão
documentadas por tabela em `DATABASE.md` seção 10 e `SECURITY.md` seção 1.

RLS nunca é desabilitado pra "resolver" bug de aplicação (regra absoluta
nº 6) — bug de query é corrigido na query, não abrindo a tabela.

---

## 8. RBAC

8 papéis fixos (sem custom roles nessa fase): `OWNER, ADMIN, MANAGER,
SALES, ESTIMATOR, TECHNICIAN, FINANCE, VIEWER`. Matriz completa
ação × módulo × papel: `SECURITY.md` seção 1.

Duas camadas obrigatórias, nenhuma substitui a outra:

1. **RLS** — quando o dado é sensível o suficiente pra restringir por
   papel além de tenant (ex.: financeiro, produção por técnico).
2. **App** — `lib/auth/rbac.ts` (`requireRole`) chamado no início de
   toda Server Action/Route Handler antes de tocar em dado sensível.

UI escondendo botão/menu pra quem não tem permissão é cosmético, nunca a
única barreira (regra absoluta nº 10).

---

## 9. Storage

Buckets do Supabase Storage, um por tipo de conteúdo (`quote-photos`,
`delivery-signatures`, futura `ai-knowledge-attachments`), path sempre
prefixado por `tenant_id` (`{tenant_id}/{entity_id}/{filename}`) e
policy de Storage espelhando a policy de RLS de tabela (usuário só lê/
escreve dentro do prefixo do próprio tenant).

Regras adicionais (detalhe em `SECURITY.md` seção 7): mime-type e
tamanho validados no servidor, nome de arquivo gerado pelo servidor
(uuid), nunca o filename original do usuário como path.

---

## 10. API / Server Actions

Não existe uma "API pública" tradicional pra consumo externo nessa fase
— só Server Actions/Route Handlers internos ao Next (chamados pelo
próprio frontend) e Route Handlers de webhook (seção 26).

Todo Server Action segue o mesmo esqueleto:

```
1. resolver sessão (auth.uid(), tenant, role) — nunca receber isso
   como argumento vindo do client
2. requireRole([...]) quando a ação exige papel específico
3. validar input (schema Zod) — nunca confiar em shape do payload
4. chamar a função de domínio em lib/domains/<modulo>
5. a query em si é filtrada por RLS de qualquer forma (defesa em
   profundidade: mesmo se passo 2 tiver um bug, o banco ainda barra)
6. nunca devolver stack trace / detalhe interno em caso de erro
```

Se no futuro existir API externa (parceiros, app mobile, integração de
terceiro), ela entra como uma camada nova de autenticação (API keys por
tenant) sem mudar esse núcleo — não antecipado agora.

---

## 11. Autenticação

Supabase Auth pra usuários da oficina (email+senha inicialmente; MFA
avaliado depois, ver `SECURITY.md` seção 9). Cliente final do Portal
**não autentica** — acesso por token (seção 20), essa é uma diferença
importante do sistema: duas superfícies, dois modelos de identidade.

Fluxo detalhado: seção "Fluxo de autenticação" mais abaixo.

---

## 12. CRM (Clientes) — IMPLEMENTADO (ETAPA 07)

Entidade `customers`, tenant-scoped (diferente do desenho antigo do
scaffold NestJS, onde `Customer` era global/compartilhado entre
oficinas — mudança justificada pela regra de isolamento de dado de
cliente do `CLAUDE.md`). Cada oficina tem sua própria base de clientes,
sem visibilidade cruzada.

Responsabilidade do módulo: cadastro, histórico de contato, anotações,
e vínculo de veículos por cliente. O código vive em
`lib/domains/crm/`, `server/crm/` e `features/crm/`. As páginas e Server
Actions validam `crm:read`/`crm:write`; o banco reforça isolamento por
tenant, papel de escrita, vínculo cliente-veículo e exclusão lógica.
Orçamentos seguem sendo um módulo separado.

Dependência: nenhuma (módulo raiz do pipeline).

---

## 12A. Conversas — IMPLEMENTADO (ETAPA 08)

The authenticated inbox manages tenant-scoped leads and conversations.
Each conversation belongs to one lead; messages carry `tenant_id` and a
composite foreign key to that conversation. `conversation_participants`
stores agent participation and per-agent read timestamps. Owners, admins,
managers, and sales agents can assign, take over, reply to, close, and reopen
conversations. Human replies require `HUMAN_ACTIVE` and the agent to be
assigned. `AI_ACTIVE` is reserved for a future AI implementation.

No Twilio, AI, external inbound messaging, or client-facing messaging is
implemented in this stage.

---

## 13. Orçamentos — IMPLEMENTADO (ETAPA 10)

Entidade `quotes` (+ `quote_items`; `quote_photos` fica pra quando o
bucket de Storage — seção 9 — for provisionado). Recebe pedido do
Portal do Cliente ou lançamento manual pela oficina, referencia
`customer_id` + `vehicle_id`, evolui por `status` (`PENDING → IN_REVIEW
→ QUOTED → APPROVED/REJECTED/EXPIRED/CANCELLED`).

Dependências: CRM (13→12) e Veículos (13→14). Produz: gatilho pra
Ordem de Serviço (16) quando aprovado.

`access_token` (uuid) é gerado no momento da criação do quote — é o que
sustenta o acesso do cliente final pelo Portal (rota pública ainda não
implementada, ver seção 20).

Um orçamento em estado terminal (`APPROVED/REJECTED/EXPIRED/CANCELLED`)
nunca reabre nem tem seus `quote_items` editados — validado tanto em
RLS (delete de `quotes` sempre negado) quanto em código
(`isQuoteEditable` em `src/lib/domains/orcamento/models.ts`, aplicado
nas Server Actions de item e escondido na UI).

---

## 14. Veículos

Entidade `vehicles`, tenant-scoped, sempre associada a um `customer_id`
(um veículo pertence a um cliente daquela oficina). Dado técnico
(marca/modelo/ano/VIN/placa) usado pelo módulo de Orçamento e exibido
na Ordem de Serviço/Produção pra contexto.

Dependência: CRM (14→12).

---

## 15. Ordens de Serviço

Entidade `service_orders`. Criada a partir de um `quote` aprovado — não
existe OS sem orçamento aprovado por trás (garante rastreabilidade:
todo trabalho cobrado teve um orçamento aceito). Carrega `status`
(`SCHEDULED → IN_PRODUCTION → QUALITY_CHECK → READY_FOR_DELIVERY →
DELIVERED`, ou `CANCELLED`) e `assigned_to` (técnico responsável).

Dependências: Orçamentos (15→13). Alimenta: Produção (16), Estoque (17,
via consumo de peça), Financeiro (19, conta a receber), Entrega (seção
"fluxo de OS").

---

## 16. Produção

Entidade `service_order_stages` — etapas dentro de uma OS (ex.:
desmontagem, pintura, montagem, controle de qualidade), cada uma com
`status` própria. TECHNICIAN só enxerga/edita estágio de OS onde é o
`assigned_to` (regra de RLS adicional, `SECURITY.md` seção 1).

Dependência: Ordens de Serviço (16→15). Cada etapa concluída pode
disparar consumo de estoque (16→17).

---

## 17. Estoque

Entidades `inventory_items` (peças/materiais) e `inventory_movements`
(entrada/saída, sempre com `reason`: `usage | purchase | adjustment`).
Consumo por produção é sempre uma `inventory_movement` negativa
referenciando a `service_order_id` de origem — nunca um `UPDATE` direto
na quantidade sem deixar rastro.

Dependências: Produção (17←16, consumo), Compras (17←18, reposição).

---

## 18. Compras

Entidades `suppliers` e `purchase_orders`. Reposição de estoque abaixo
do `reorder_point` (ver Automações, seção 22) gera sugestão de compra —
a criação da `purchase_order` em si ainda é decisão humana nessa fase
(não auto-compra).

Dependências: Estoque (18→17, o que motiva a compra). Alimenta:
Financeiro (18→19, conta a pagar quando a compra é recebida).

---

## 19. Financeiro

Entidade `financial_transactions` (`RECEIVABLE` | `PAYABLE`), ligada a
`service_order_id` (contas a receber, geradas a partir da OS) ou
`purchase_order_id` (contas a pagar, geradas a partir da compra). Não
existe lançamento financeiro solto sem origem seguindo o pipeline —
qualquer ajuste manual precisa ficar auditável (seção 27).

Dependências: Ordens de Serviço (19←15) e Compras (19←18). Acesso mais
restrito do RBAC (só OWNER/ADMIN/FINANCE, ver seção 8).

---

## 20. Portal do Cliente

Rota pública `/(public)/p/[tenantSlug]`. Cliente final não é um
`auth.users` do Supabase — acesso via `access_token` (uuid) do `quote`/
`service_order`, recebido por email/SMS (Resend/Twilio).

Diferença estrutural do resto do sistema: como não há `auth.uid()`, o
RLS baseado em `memberships` **não protege** essas rotas — o isolamento
aqui é 100% responsabilidade de código de aplicação (validar token antes
de qualquer leitura, nunca aceitar `id` + token vindos separadamente).
Esse é o ponto do sistema com maior superfície de risco de IDOR — ver
`SECURITY.md` seção 2 pros controles completos.

Funcionalidade do portal (quando implementado): acompanhar status do
orçamento/OS, aprovar orçamento, confirmar agendamento — nunca acesso a
dado de outro registro do mesmo tenant.

---

## 21. IA — núcleo implementado (ETAPA 09)

Cada tenant possui um registro `ai_agents`, instruções e conhecimento
próprios (`ai_agent_instructions`), além de `ai_agent_usage`. A chamada ao
OpenAI acontece em `services/openai.ts` no servidor. Configuração, histórico
e contexto são carregados com o tenant da sessão; a persistência de resposta
e tokens é atômica e revalida o estado `AI_ACTIVE`.

O prompt mantém instruções fixas no papel `system`, configuração,
conhecimento e instruções do tenant em mensagens `developer`, e mensagens
dos clientes isoladas no papel `user`. Texto do cliente não é concatenado
ao prompt do sistema. A IA não possui tools para executar operações.
`HUMAN_ACTIVE` prevalece: takeover bloqueia a resposta de IA.

A configuração e a transição para AI exigem autenticação e RBAC; portal
público, ingestão por Twilio/webhook, RAG/embeddings e propostas/orçamentos
gerados pela IA continuam fora desta etapa. A migration `20260927220000`
está validada localmente; sua aplicação remota é uma ação separada.

---

## 22. Automações

Não é módulo de dado próprio — é comportamento que cruza os módulos
acima, disparado por evento ou por tempo:

- **Follow-up de lead sem resposta**: `quote` parado em `PENDING`/
  `IN_REVIEW` por X horas → notificação (Resend/Twilio) pra oficina e/ou
  lembrete pro cliente.
- **Lembrete de agendamento**: X horas antes do `scheduled_at` da OS →
  Twilio/Resend pro cliente, evento no Google Calendar.
- **Estoque baixo**: `inventory_items.quantity_on_hand <=
reorder_point` → alerta pra papel de Compras/Estoque.
- **Cobrança em atraso**: `financial_transactions` tipo `RECEIVABLE`
  com `due_date` vencida → alerta pro Financeiro.

Implementação prevista via Supabase Edge Function agendada (cron) ou
trigger de banco + fila — decisão de implementação, não de arquitetura,
fica pra quando o módulo entrar em desenvolvimento.

---

## 23. Integrações externas

| Serviço         | Uso                                               | Direção                             |
| --------------- | ------------------------------------------------- | ----------------------------------- |
| OpenAI          | Respostas do AI Agent (21), server-only            | App → OpenAI                        |
| Resend          | Email transacional (orçamento, lembrete, convite) | App → Resend                        |
| Twilio          | SMS (lembrete, notificação)                       | App → Twilio, Twilio → webhook (26) |
| Google Calendar | Agendamento de OS                                 | App ↔ Google (OAuth por tenant)     |
| Paddle          | Billing (24)                                      | App → Paddle, Paddle → webhook (26) |
| PostHog         | Analytics (25)                                    | App → PostHog                       |

Toda credencial de integração fica server-side (`SECURITY.md` seção 3).
Google Calendar exige OAuth por tenant (cada oficina conecta sua própria
conta) — token armazenado associado ao `tenant_id`, nunca compartilhado
entre tenants.

---

## 24. Billing

Entidade `subscriptions`, 1:1 com `tenant_id`, espelhando o estado da
assinatura no Paddle (`paddle_customer_id`, `paddle_subscription_id`,
`plan`, `status`, `current_period_end`). Paddle é merchant of record —
resolve imposto internacional, o app não recalcula isso.

Só **OWNER** vê/gerencia billing (seção 8). Mudança de estado vem do
webhook do Paddle (seção 26), nunca de um update manual direto na
tabela pelo app.

---

## 25. Analytics

PostHog client-side + eventos server-side quando fizer sentido (ex.:
conversão de orçamento, que acontece num Server Action). Todo evento
carrega `tenant_id` como propriedade obrigatória — sem isso o evento é
descartado, não logado "sem tenant" (regra absoluta nº 15, analytics
tenant-scoped).

---

## 26. Webhooks

Route Handlers dedicados por provider (`/api/webhooks/paddle`,
`/twilio`, `/google-calendar`). Toda rota de webhook:

1. valida assinatura (quando o provider suporta — todos os três
   suportam, ver `SECURITY.md` seção 4);
2. é idempotente (upsert por id do evento do provider, nunca insert
   cego repetido);
3. deriva `tenant_id` a partir de uma referência já existente no banco
   (ex.: `paddle_customer_id → subscriptions → tenant_id`), nunca aceita
   `tenant_id` vindo do payload do provider como verdade final.

---

## 27. Auditoria

Tabela única `audit_logs` (schema em `DATABASE.md` seção 8), tenant-
-scoped (`tenant_id` nulo só pra evento de sistema). Lista do que
sempre gera registro: `SECURITY.md` seção 8 (criação/edição de
orçamento, aprovação, mudança de estágio de produção, movimentação de
estoque, lançamento financeiro, convite/remoção de membro, login).

Auditoria é apend-only — nenhum fluxo do sistema edita ou apaga uma
linha de `audit_logs` já gravada.

---

## 28. Segurança

Resumo — detalhe completo em `SECURITY.md` e nas 27 regras absolutas do
`CLAUDE.md`:

- Tenant sempre resolvido via `auth.uid()` + `memberships`, nunca via
  input do client.
- RLS em toda tabela tenant-scoped, com `with check` em toda policy de
  escrita.
- RBAC em duas camadas (RLS + app), nunca só UI.
- Secrets só server-side, nunca em log.
- Webhooks com assinatura + idempotência.
- Erros nunca vazam stack trace/detalhe interno.
- IA nunca recebe input do usuário como instrução privilegiada.
- Portal do cliente (sem `auth.uid()`) protegido só por validação de
  token no código de aplicação — ponto de maior atenção do sistema.

---

## Estrutura de pastas

```
app/
├── (public)/
│   ├── p/[tenantSlug]/{page.tsx,[quoteId]/page.tsx,layout.tsx}
│   └── login/ signup/
├── (app)/
│   ├── layout.tsx            # resolve tenant + membership + role
│   ├── crm/
│   ├── orcamentos/
│   ├── veiculos/
│   ├── ordens-servico/
│   ├── producao/
│   ├── estoque/
│   ├── compras/
│   ├── financeiro/
│   ├── entregas/
│   ├── pos-venda/
│   └── configuracoes/
└── api/webhooks/{paddle,twilio,google-calendar}/route.ts

lib/
├── auth/{session.ts,rbac.ts}
├── supabase/{server.ts,browser.ts,admin.ts}
├── domains/{crm,orcamento,veiculos,ordem-servico,producao,estoque,
│            compras,financeiro,entrega,pos-venda,ai,billing}/
├── integrations/{resend,twilio,google-calendar,paddle,posthog,openai}.ts
└── db/types.ts
```

`lib/supabase/admin.ts` (usa `service_role`) é importável só por Route
Handlers de webhook e Edge Functions — nunca por código que roda no
browser nem por Server Actions comuns (essas usam `server.ts`, que
carrega o client no contexto do usuário autenticado).

---

## Fronteiras entre módulos

Cada domínio em `lib/domains/<x>/` só lê/escreve suas próprias tabelas
diretamente. Quando precisa de dado de outro módulo, chama a função
pública do outro domínio (não faz `select` direto na tabela alheia).
Exemplo: `ordem-servico` não faz join cru em `inventory_items` — chama
`estoque.consumirPeca(...)`. Isso mantém a regra de negócio de cada
módulo (ex.: "toda saída de estoque precisa de `reason`") num único
lugar.

Módulos não têm acesso um ao outro por import direto de arquivo interno
— só pelo `index.ts` (barrel) de cada domínio, que é a "API interna" do
módulo.

---

## Entidades principais

`tenants, memberships, customers, vehicles, quotes, quote_items,
quote_photos, service_orders, service_order_stages, inventory_items,
inventory_movements, suppliers, purchase_orders,
financial_transactions, deliveries, post_service_feedback,
subscriptions, audit_logs, ai_knowledge_base` — schema completo de cada
uma em `DATABASE.md`.

---

## Dependências entre módulos

```
CRM ← Veículos ← Orçamentos ← Ordens de Serviço ← Produção → Estoque ← Compras
                                     │                              │
                                     ▼                              ▼
                                Financeiro ←──────────────────────────┘
                                     │
                                     ▼
                                  Entrega → Pós-venda

Billing e Analytics: transversais, dependem só de Tenant (não de nenhum
módulo operacional).
IA: transversal, consumida por Orçamentos (qualificação) e, futuro,
por outros módulos — não é dependência bloqueante de nenhum.
```

---

## Fluxo de dados

```
Portal do Cliente / lançamento manual
   → Orçamento (quotes)
   → Aprovação
   → Ordem de Serviço
   → Produção (consome Estoque)
   → Financeiro (a receber) + Compras/Financeiro (a pagar, via Estoque)
   → Entrega
   → Pós-venda
```

Cada seta é uma transição de estado que gera `audit_logs` — nunca uma
edição silenciosa (mantido da v1).

---

## Fluxo de autenticação

```
1. Usuário da oficina faz login (Supabase Auth: email+senha)
2. Supabase emite JWT contendo auth.uid()
3. Next.js guarda a sessão via cookie (Supabase SSR helpers)
4. Toda requisição subsequente ao Supabase carrega esse JWT
5. Postgres, ao processar a query, resolve auth.uid() a partir do JWT
   (não é o app que "informa" quem é o usuário pro banco)
```

Cliente final: **não passa por esse fluxo** — ver Fluxo do Portal do
Cliente.

---

## Fluxo de autorização

```
1. Server Action/Route Handler recebe a requisição
2. lib/auth/session.ts resolve { tenantId, userId, role } a partir de
   auth.uid() + memberships (nunca de input do client)
3. requireRole(ctx, [roles permitidos]) — barra aqui se o papel não
   permite a ação (camada de app)
4. A query em si roda com RLS ativo — mesmo que o passo 3 tivesse uma
   falha, o Postgres ainda restringe por tenant_id (e por regra extra
   de papel, quando a tabela tiver, ex.: TECHNICIAN em service_orders)
5. Resposta nunca inclui detalhe que revele a existência de dado de
   outro tenant (404 vs 403, ver SECURITY.md seção 5)
```

---

## Fluxo de tenant resolution

```
auth.uid() (JWT validado)
   → select tenant_id, role from memberships
     where user_id = auth.uid() and is_active
   → se 1 resultado: tenant ativo é esse
   → se >1 resultado (usuário em múltiplas oficinas): UI oferece troca
     de tenant ativo (preferência de exibição/sessão), mas cada query
     subsequente é validada de novo pela policy RLS contra a membership
     real — a "troca" nunca vira um valor confiável sozinho
```

---

## Fluxo de orçamento

```
Cliente (portal ou lançamento manual)
   → preenche veículo + descrição do dano + fotos
   → quotes.status = PENDING
Oficina (SALES/ESTIMATOR)
   → analisa, define preço/prazo → quotes.status = QUOTED
Cliente (portal, via access_token)
   → aprova → quotes.status = APPROVED (gera Ordem de Serviço)
   → ou rejeita → quotes.status = REJECTED
   (sem resposta até quote_expires_at → EXPIRED, via automação)
```

---

## Fluxo de OS

```
quotes.status = APPROVED
   → cria service_orders (status = SCHEDULED, assigned_to definido)
   → Produção avança os service_order_stages
   → todas as etapas concluídas → QUALITY_CHECK → READY_FOR_DELIVERY
   → Entrega registrada (deliveries) → service_orders.status = DELIVERED
   → dispara financial_transactions (RECEIVABLE) se ainda não existir
```

---

## Fluxo de produção

```
service_orders.status = IN_PRODUCTION
   → cada service_order_stage avança PENDING → IN_PROGRESS → DONE
     (ou BLOCKED, com notes explicando o motivo)
   → TECHNICIAN só edita estágio de OS onde é assigned_to
   → consumo de peça em qualquer estágio → inventory_movements
     (reason = 'usage', referenciando service_order_id)
   → todas as etapas DONE → habilita transição de status da OS
```

---

## Fluxo financeiro

```
Origem RECEIVABLE: service_orders (entregue) → financial_transactions
  (type=RECEIVABLE, status=PENDING) → pagamento registrado → PAID
Origem PAYABLE: purchase_orders (recebida do fornecedor) →
  financial_transactions (type=PAYABLE, status=PENDING) → pagamento
  efetuado → PAID
Vencido sem pagamento → status=OVERDUE (via automação, seção 22)
Acesso: só OWNER/ADMIN/FINANCE (RBAC, seção 8)
```

---

## Fluxo do portal do cliente

```
1. Cliente recebe link com access_token (Resend/SMS Twilio) ao ser
   criado o quote ou ao avançar a OS
2. Acessa /(public)/p/[tenantSlug]/[quoteId]?token=<access_token>
3. Server-side: busca o registro POR access_token (nunca por id
   separado do token) — token errado ou ausente = 404, nunca detalhe
   do motivo
4. Registro validado → carrega dados relacionados (fotos, itens, OS)
   já filtrando por quote_id/tenant_id do próprio registro validado,
   nunca por valor solto vindo da URL/query string
5. Ações do cliente (aprovar orçamento, confirmar agendamento) passam
   pela mesma Server Action de domínio que a oficina usaria, com
   actor_type='customer_portal' no audit_logs
6. Token expira N dias após DELIVERED (prazo exato: decisão de
   implementação, ver SECURITY.md seção 9)
```
