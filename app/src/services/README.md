# services/

Clients dos serviços externos (ARCHITECTURE.md seção 23): OpenAI, Resend,
Twilio, Google Calendar, Paddle, PostHog. Um arquivo por provider. Todo
arquivo aqui importa `server-only` no topo e lê credenciais só de
`config/env.server.ts` — nunca hardcoded, nunca de `config/env.public.ts`.

Vazio nessa etapa — integrações entram numa etapa futura.
