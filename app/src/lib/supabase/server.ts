import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/config/env.public";

/**
 * Client Supabase para uso em Server Components/Server Actions/Route
 * Handlers — roda no contexto do usuário autenticado (cookies da sessão),
 * nunca com service_role. Ver ARCHITECTURE.md seção 3/9 e
 * lib/supabase/README.md.
 *
 * Ainda não integrado a um projeto Supabase real (etapa futura) — este
 * client é código de produção correto, mas sem integração testada contra
 * um backend de verdade.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie (só Server Action/
          // Route Handler podem) — Supabase recomenda ignorar aqui, a
          // sessão é revalidada no middleware/próxima requisição mutável.
        }
      },
    },
  });
}
