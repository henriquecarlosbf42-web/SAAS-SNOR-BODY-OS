# services/

Clients dos serviços externos (ARCHITECTURE.md seção 23): OpenAI, Resend,
Twilio, Google Calendar, Paddle, PostHog. Um arquivo por provider. Todo
arquivo aqui importa `server-only`; credenciais são lidas exclusivamente
no servidor — nunca hardcoded, nunca de `config/env.public.ts`.

`openai.ts` executa Chat Completions server-side com `OPENAI_API_KEY`,
timeout e validação da resposta. A chave nunca é retornada por Server
Actions nem incluída em props. O módulo de conversas constrói o prompt e
persiste resposta e tokens de uso na mesma operação protegida por RLS.
O único caminho que usa `SUPABASE_SERVICE_ROLE_KEY` é essa RPC estreita:
ela só aceita chamadas com role `service_role` e valida novamente a
membership do ator, tenant, agente e estado da conversa.

As integrações Resend, Twilio, Google Calendar, Paddle e PostHog continuam
pendentes.
