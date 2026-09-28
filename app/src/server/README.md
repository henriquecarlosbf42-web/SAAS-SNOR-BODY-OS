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

`crm/actions.ts` valida autorização e payload antes de executar mutações;
`crm/queries.ts` expõe leituras autorizadas para Server Components e
`crm/data.ts` mantém o acesso ao Supabase no servidor.

`conversations/` segue a mesma fronteira para Inbox, leitura de mensagens,
atribuição, takeover humano e gestão de status.

`ai-agent/` valida a permissão e deriva tenant/ator da sessão. O contexto
é lido com o client autenticado; somente a RPC server-only de persistência
usa `service_role`, restrita por grant de função e revalidação de membership.
