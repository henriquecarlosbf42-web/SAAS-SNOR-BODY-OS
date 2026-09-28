# lib/domains/

Regra de negócio pura, um subpasta por módulo (`crm`, `conversations`, `orcamento`,
`veiculos`, `ordem-servico`, `producao`, `estoque`, `compras`,
`financeiro`, `entrega`, `pos-venda`, `ai`, `billing` — ARCHITECTURE.md
seções 12-24). Cada domínio expõe só o `index.ts` (barrel) como API
interna — outro domínio nunca importa um arquivo interno de outro
diretamente (ver ARCHITECTURE.md, "Fronteiras entre módulos").

`crm/` e `conversations/` contêm schemas e tipos puros dos respectivos
módulos. Os próximos módulos entram somente quando suas etapas forem autorizadas.
