# features/

Um subpasta por módulo de negócio (`crm/`, `orcamentos/`, `veiculos/`,
`ordens-servico/`, `producao/`, `estoque/`, `compras/`, `financeiro/`,
`entregas/`, `pos-venda/`) quando a implementação começar — ver
ARCHITECTURE.md seções 12-19.

Cada subpasta agrupa componentes e hooks que só fazem sentido pra aquele
módulo (não compartilhados). Chama a lógica de domínio via
`lib/domains/<modulo>`, nunca faz query direta ao banco.

Vazio nessa etapa (ETAPA 02 é só fundação técnica) — não criar módulo de
negócio aqui ainda.
