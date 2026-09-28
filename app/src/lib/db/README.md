# lib/db/

`types.ts` — tipos TypeScript gerados a partir do schema real do Supabase
(`supabase gen types typescript`), depois que o projeto Supabase e as
migrations de `DATABASE.md` existirem de verdade. Não escrever à mão;
regenerar quando o schema mudar.

O schema tipado ainda depende de um projeto Supabase real para gerar os
tipos (`supabase gen types typescript`). As migrations locais existem, mas
tipos gerados à mão não devem ser adicionados.
