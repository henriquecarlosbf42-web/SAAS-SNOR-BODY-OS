# server/

Server Actions organizadas por módulo — a camada fina que o Route
Handler/formulário chama. Todo arquivo aqui importa `server-only` no topo.

Esqueleto obrigatório de toda função aqui (ver ARCHITECTURE.md, seção
"Fluxo de autorização"):

1. resolver sessão (`lib/auth/session.ts`) — nunca receber tenant/role
   como argumento vindo do client
2. `requireRole(...)` quando a ação exige papel específico
3. validar input (Zod)
4. chamar a função de domínio em `lib/domains/<modulo>`
5. nunca devolver stack trace / detalhe interno em erro

Vazio nessa etapa — fundação técnica apenas, sem Server Action de negócio
ainda.
