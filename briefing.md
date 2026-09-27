# Briefing — SNOR FUNILARIA

> Criado em: 2026-09-27 (como "BodyQuote SaaS") | Renomeado e stack pivotada
> em 2026-09-27 | Status: Em definição
>
> Escopo ampliado no pivot: além de orçamento + agendamento, o produto passa
> a cobrir CRM, ordem de serviço, produção, estoque, compras, financeiro,
> entrega e pós-venda — ver `CLAUDE.md` pro fluxo completo e as regras de
> segurança/multi-tenant atualizadas.
>
> Duas sessões cloud ("SAAS orçamento funilaria e pintura") estavam
> construindo a versão antiga (stack NestJS/Prisma) quando o pivot
> aconteceu — avisadas do rename e da troca de stack.

---

## 1. O que é

Um SaaS **B2B** voltado ao mercado internacional (prioritariamente EUA/Europa) para **funilarias e oficinas de pintura automotiva** (auto body shops).

A funilaria assina o plano → configura seu perfil → recebe pedidos de clientes → envia orçamentos → confirma agendamentos → tudo pela plataforma.

O cliente final acessa via link público da funilaria (ou busca no diretório), envia fotos do veículo e descreve o dano → aguarda o orçamento → aprova → agenda.

---

## 2. Problema que resolve

Hoje funilarias perdem clientes porque:
- Não têm como receber pedidos fora do horário comercial
- Processo de orçamento é manual (WhatsApp, telefonema)
- Não têm histórico organizado de clientes e jobs
- Não conseguem gerenciar agendamentos de forma eficiente

O SNOR FUNILARIA digitaliza esse processo e entrega uma experiência moderna.

---

## 3. Personas

### Persona A — A Funilaria (cliente pagante do SaaS)
- Dono ou gerente de auto body shop nos EUA / Europa
- Entre 2 e 20 funcionários
- Usa pouco software — precisa de algo simples e confiável
- Paga mensalmente (Stripe)
- Quer: receber leads organizados, não perder orçamentos, lotar a agenda

### Persona B — O Cliente Final (usuário do sistema da funilaria)
- Pessoa que bateu o carro ou quer polimento/pintura
- Acessa pelo celular
- Quer: rapidez, transparência no preço, não precisar ligar
- Não paga pelo SaaS — é cliente da funilaria

---

## 4. Fluxo principal (MVP)

```
[Cliente final]
    ↓
Acessa link da funilaria (ex: bodyquote.com/shop/sunshine-auto)
    ↓
Preenche formulário: tipo de serviço, fotos do veículo, descrição do dano
    ↓
[Funilaria recebe notificação]
    ↓
Acessa painel → visualiza o pedido → envia orçamento com valor e prazo
    ↓
[Cliente recebe orçamento por email/SMS]
    ↓
Cliente aprova → escolhe data disponível → confirma agendamento
    ↓
[Funilaria confirma na agenda]
    ↓
Job fica registrado no histórico
```

---

## 5. Serviços cobertos

- **Collision repair** — reparos de colisão / amassados
- **Paint job** — pintura completa ou parcial
- **Dent removal / PDR** — remoção de amassados sem pintura
- **Polishing / detailing** — polimento e detalhamento
- **Glass replacement** — troca de vidro (futuro)
- **Frame straightening** — alinhamento de chassi (futuro)

---

## 6. Funcionalidades do MVP

### Portal da Funilaria (painel admin)
- [ ] Cadastro e onboarding da funilaria
- [ ] Perfil público da funilaria
- [ ] Lista de pedidos recebidos (quote requests)
- [ ] Visualizar fotos e detalhes do pedido
- [ ] Enviar orçamento (valor, prazo, observações)
- [ ] Gerenciar agenda / slots disponíveis
- [ ] Histórico de jobs

### Portal do Cliente Final
- [ ] Formulário de solicitação de orçamento
- [ ] Upload de fotos (máx 10 fotos, 5MB cada)
- [ ] Acompanhamento do status do pedido
- [ ] Aprovação de orçamento
- [ ] Seleção de data para agendamento
- [ ] Confirmação por email

### Infraestrutura SaaS
- [ ] Multi-tenant com isolamento por shop_id
- [ ] Autenticação da funilaria (login, MFA futuro)
- [ ] Planos de assinatura (Stripe)
- [ ] Subdomain ou slug por funilaria
- [ ] Notificações por email (Resend ou SendGrid)

---

## 7. Fora do escopo do MVP

- App mobile nativo (iOS/Android) — PWA primeiro
- Pagamento do serviço pela plataforma (apenas orçamento e agendamento)
- Integração com seguradoras
- Chat em tempo real (notificações por email no MVP)
- Multi-idioma (EN-US primeiro, i18n preparado mas não ativado)
- Relatórios avançados / analytics

---

## 8. Monetização

| Plano | Preço/mês | Limites |
|-------|-----------|---------|
| Starter | \$29/mês | Até 30 quotes/mês, 1 usuário |
| Growth | \$79/mês | Ilimitado, 3 usuários, analytics básico |
| Pro | \$149/mês | Ilimitado, usuários ilimitados, API, priority support |

> Preços a validar com pesquisa de mercado. Stripe Subscriptions desde o MVP.

---

## 9. Concorrentes a pesquisar

- **Shop-Ware** — software de gestão de oficinas
- **Mitchell1** — estimativas de reparo
- **CCC One** — sistema de estimativas (muito complexo)
- **Openings** — agendamento genérico

**Diferencial:** mais simples, focado em body shops pequenos/médios, experiência do cliente final muito melhor, preço acessível.

---

## 10. Stack técnica (pivotada em 2026-09-27)

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Frontend | Next.js + TypeScript + Tailwind CSS | SSR, SEO, ecossistema robusto |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) | RLS nativo pra multi-tenancy, menos peças móveis que backend separado |
| Multi-tenancy | `tenant_id` + PostgreSQL RLS + RBAC | Isolamento em nível de banco, não só de aplicação |
| Pagamentos | Paddle | Merchant of record, simplifica compliance internacional |
| Email | Resend | Simples, barato, boa DX |
| SMS | Twilio | Notificações e follow-up de leads/clientes |
| Calendar | Google Calendar | Agendamento de serviços |
| AI | OpenAI API | Atendimento inicial, futuras cotações assistidas |
| Analytics | PostHog | Produto + funil, tenant-scoped |
| Deploy | Vercel | Padrão Next.js, simples |

> Stack anterior (NestJS + Prisma + Clerk + Cloudflare R2) preservada em
> `app-legado-nestjs/` — não usar como base do novo app.

---

## 11. Próximos passos

- [x] Nome final do produto definido: **SNOR FUNILARIA**
- [x] Stack pivotada para Next.js + Supabase
- [ ] Criar repositório GitHub
- [ ] Desenhar arquitetura multi-tenant (RLS + RBAC) — `ARCHITECTURE.md`
- [ ] Desenhar banco de dados (schema inicial) — `DATABASE.md`
- [ ] Prototipar telas no Figma ou com v0.dev
- [ ] Iniciar backend: auth + tenant + membership
- [ ] Iniciar frontend: landing + portal do cliente
