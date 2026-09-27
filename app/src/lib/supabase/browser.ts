import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/config/env.public";

/**
 * Client Supabase pra Client Components — usa a anon key (segura de
 * expor, é a RLS que protege). Nunca importar lib/supabase/server.ts ou
 * admin.ts a partir de um Client Component.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
