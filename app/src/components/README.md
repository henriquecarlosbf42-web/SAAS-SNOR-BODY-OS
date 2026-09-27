# components/

UI reutilizável e agnóstica de domínio (design system: botão, input, card,
tabela). Nunca importa `server-only`, nunca faz query direta ao Supabase.
Recebe dado via props.

Componente específico de uma tela/fluxo de negócio vai em `features/`, não
aqui.
