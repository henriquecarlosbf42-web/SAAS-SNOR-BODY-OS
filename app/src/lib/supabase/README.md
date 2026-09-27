# lib/supabase/

> ETAPA 04 — `server.ts` implementado (client SSR, cookies da sessão,
> nunca `service_role`). Não integration-testado ainda (sem projeto
> Supabase real vinculado — `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` seguem
> só em `.env.example`, sem valor real).

Faltam: `browser.ts` (anon key, Client Components) e `admin.ts`
(`service_role` — só Route Handlers de webhook e Edge Functions) — ver
ARCHITECTURE.md seção 3/9. Entram quando os módulos que precisam deles
(Portal do Cliente, webhooks) forem implementados.
