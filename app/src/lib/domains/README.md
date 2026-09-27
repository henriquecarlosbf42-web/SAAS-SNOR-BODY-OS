# lib/domains/

Regra de negócio pura, um subpasta por módulo (`crm`, `orcamento`,
`veiculos`, `ordem-servico`, `producao`, `estoque`, `compras`,
`financeiro`, `entrega`, `pos-venda`, `ai`, `billing` — ARCHITECTURE.md
seções 12-24). Cada domínio expõe só o `index.ts` (barrel) como API
interna — outro domínio nunca importa um arquivo interno de outro
diretamente (ver ARCHITECTURE.md, "Fronteiras entre módulos").

Vazio nessa etapa — nenhum módulo de negócio implementado ainda (CRM,
orçamento, ERP ficam fora do escopo desta etapa por instrução explícita).
