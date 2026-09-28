# SNOR FUNILARIA

> Projeto criado em 2026-09-27 (como "BodyQuote SaaS"). Renomeado e com stack
> pivotada em 2026-09-27. Pasta dedicada — instruções aqui sobrescrevem as da
> raiz quando relevantes.

## Sobre

SaaS B2B multi-tenant para oficinas de funilaria e pintura automotiva
(auto body shops), mercado inicial EUA/Europa. Permite que a oficina
administre todo o processo do negócio:

```
ORÇAMENTO ONLINE → CRM → CLIENTE → VEÍCULO → ORÇAMENTO → APROVAÇÃO
→ ORDEM DE SERVIÇO → PRODUÇÃO → ESTOQUE → COMPRAS → FINANCEIRO
→ ENTREGA → PÓS-VENDA
```

Também terá um **Portal do Cliente** pra acompanhamento do veículo.

Construído desde o primeiro commit como SaaS comercial (não é MVP descartável).

## Tipo

Projeto interno — produto próprio pra venda internacional.

## Entregas previstas

- App web (SaaS) — painel da oficina + portal do cliente
- Multi-tenant com isolamento por `tenant_id` + RLS
- Módulos: CRM, conversas, orçamento, veículos, OS, produção, estoque,
  compras, financeiro, entrega, pós-venda

## Onde salvar o que

- Briefings e contexto: `projetos/SNOR FUNILARIA/` (raiz do projeto)
- Código fonte: `projetos/SNOR FUNILARIA/app/`
- Documentação técnica: `projetos/SNOR FUNILARIA/docs/`
- Design / UI: `projetos/SNOR FUNILARIA/design/`
- Infraestrutura / DevOps: `projetos/SNOR FUNILARIA/infra/`
- Scaffold antigo (NestJS/Prisma, pré-pivot): `projetos/SNOR FUNILARIA/app-legado-nestjs/`
  — não usar como base, ver `LEGADO.md` dentro da pasta

## Contexto que herda da raiz

Esse projeto herda automaticamente o tom de voz, marca e contexto do negócio
definidos em `_memoria/` e `identidade/` da raiz. Não duplicar essas
informações aqui.

---

## Stack

**Frontend:** Next.js + TypeScript + Tailwind CSS
**Backend:** Supabase (PostgreSQL, Supabase Auth, Supabase Storage, Edge
Functions quando necessário)
**Hosting:** Vercel
**AI:** OpenAI API
**Email:** Resend
**SMS:** Twilio
**Calendar:** Google Calendar
**Billing:** Paddle
**Analytics:** PostHog

> Stack decidida em 2026-09-27 — substitui a decisão anterior
> (NestJS + Prisma + Clerk + Cloudflare R2), preservada em `app-legado-nestjs/`.

## Arquitetura multi-tenant

Shared Database + Shared Schema + `tenant_id` + PostgreSQL Row-Level Security
(RLS) + RBAC.

Cada empresa (oficina) é um tenant independente. O isolamento entre tenants
é requisito crítico — **um tenant nunca pode acessar dados de outro tenant.**

O tenant atual é determinado por:

```
authenticated user → membership → tenant
```

**Nunca** confiar em `tenant_id` enviado pelo frontend ou fornecido pelo
usuário como mecanismo de autorização.

### RBAC — papéis

```
OWNER
ADMIN
MANAGER
SALES
ESTIMATOR
TECHNICIAN
FINANCE
VIEWER
```

Nunca usar somente ocultação de interface para controle de acesso — o
backend/banco deve validar permissões sempre.

**Princípio:**

> O usuário autenticado determina o tenant.
> O tenant determina os dados acessíveis.
> O role determina as ações permitidas.

---

## Regras absolutas de segurança

1. Nunca confiar em `tenant_id` enviado pelo frontend.
2. Nunca usar `tenant_id` fornecido pelo usuário como mecanismo de autorização.
3. O tenant atual deve ser determinado através da sessão autenticada e da
   membership do usuário.
4. Toda informação tenant-scoped deve possuir mecanismo de isolamento.
5. Toda tabela tenant-scoped deve utilizar RLS.
6. Nunca desabilitar RLS para resolver problemas de aplicação (nem como
   solução temporária).
7. Nunca utilizar `service_role` no frontend.
8. Secrets nunca podem ser enviados ao frontend / nunca em Git.
9. Secrets nunca devem aparecer em logs.
10. Autorização não pode depender somente da interface.
11. RBAC deve ser aplicado no backend e/ou banco.
12. Um usuário do Tenant A nunca poderá consultar, modificar ou excluir
    dados do Tenant B.
13. Arquivos (uploads/Storage) também devem ser tenant-scoped.
14. Knowledge Base da IA também deve ser tenant-scoped.
15. Analytics também deve ser tenant-scoped.
16. Billing deve ser associado ao tenant.
17. Usage deve ser associado ao tenant.
18. Webhooks devem validar assinatura quando o provider oferecer.
19. Webhooks devem possuir idempotência.
20. APIs/server actions devem validar autenticação e autorização.
21. Nunca retornar stack traces para o usuário.
22. Nunca retornar secrets ou informações internas em erros.
23. Proteger contra IDOR e privilege escalation.
24. Toda operação sensível deve ser autorizada no backend/database, nunca
    só no frontend.
25. Validar todos os inputs.
26. Nunca criar mocks permanentes fingindo funcionalidades reais, nem
    inventar dados de clientes/métricas/integrações falsas.
27. Nunca remover testes de segurança pra fazer o build passar.

Isolamento por tenant se aplica a: clientes, veículos, ordens de serviço,
financeiro, estoque e dados/knowledge base de IA.

---

## Regras de desenvolvimento

O projeto será desenvolvido em etapas pequenas, isoladas e validáveis.

**Antes de implementar uma etapa:**

1. Analisar o código existente
2. Verificar arquitetura
3. Identificar arquivos afetados
4. Identificar impacto na segurança
5. Implementar somente o escopo solicitado

**Depois de implementar:**

1. Executar testes
2. Executar lint
3. Executar typecheck
4. Executar build quando aplicável
5. Corrigir erros
6. Informar o resultado (ver formato de resposta abaixo)

- Nunca implementar funcionalidades de etapas futuras
- Nunca alterar funcionalidades não relacionadas sem necessidade
- Nunca fazer refatorações gigantes fora do escopo
- TypeScript strict
- Componentes reutilizáveis, código modular
- Separação clara entre UI, domínio, serviços e infraestrutura
- Não duplicar lógica, não criar código morto
- Não implementar funcionalidades fora do escopo da etapa atual

### Banco de dados

- Migrations versionadas
- UUIDs, foreign keys, indexes, unique constraints, check constraints
  quando apropriado
- `created_at` / `updated_at` em todas as tabelas
- Soft delete quando necessário
- Auditoria para operações críticas

### Git

- **Não** executar `git push` sem autorização explícita
- **Não** criar commits automaticamente sem autorização explícita
- Antes de grandes alterações, verificar `git status` e `git diff`
- Nunca apagar trabalho existente sem explicar antes

### Arquitetura de código

Manter separação entre: UI, Business Logic, Data Access, Authentication,
Authorization, External Services, Database, AI, Billing.

Evitar colocar regras críticas diretamente em componentes React. Não
duplicar regras de autorização em dezenas de arquivos — criar abstrações
reutilizáveis.

---

## Resposta obrigatória ao final de cada etapa

```
STATUS
FILES CREATED
FILES MODIFIED
DATABASE CHANGES
SECURITY IMPACT
MULTI-TENANT IMPACT
RBAC IMPACT
TESTS
LINT
TYPECHECK
BUILD
KNOWN RISKS
NOT IMPLEMENTED
NEXT STEP
```

**Regra absoluta:** não iniciar a próxima etapa sem autorização explícita
do usuário.

---

## Documentação

Manter atualizados dentro do projeto:

- `CLAUDE.md` (esse arquivo)
- `ARCHITECTURE.md`
- `DATABASE.md`
- `SECURITY.md`
- `DEVELOPMENT.md`
- `TEST_REPORT.md`
- `PRODUCTION_CHECKLIST.md`

> `TEST_REPORT.md` é atualizado por etapa. `PRODUCTION_CHECKLIST.md`
> continua pendente até a preparação de release.

---

## Objetivo

Construir um SaaS internacional seguro, escalável, multi-tenant e
preparado pra produção. Segurança e isolamento de tenant têm prioridade
maior que velocidade de desenvolvimento.

**Quando houver conflito entre conveniência e segurança: priorize segurança.**

---

## Específico desse projeto

- Nicho inicial: auto repair / body shops. Vertical fechado (não é a versão
  genérica multi-nicho do SNOR LEAD AI) — construir os módulos (OS, estoque,
  compras, financeiro) já pensando no fluxo de oficina, sem abstrair pra
  outros segmentos de serviço.
- Duas sessões cloud avulsas ("SAAS orçamento funilaria e pintura") estavam
  construindo a versão antiga (NestJS/Prisma) desse mesmo projeto quando o
  pivot de nome/stack aconteceu — avisadas em 2026-09-27, ver `briefing.md`.
