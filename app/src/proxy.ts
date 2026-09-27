import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/config/env.public";

/**
 * Roda em toda requisição (exceto assets, ver `config.matcher` no fim).
 * Duas responsabilidades:
 *
 * 1. Revalidar/renovar o cookie de sessão do Supabase Auth — sem isso a
 *    sessão expira silenciosamente em Server Components (que só leem
 *    cookie, não podem escrevê-lo).
 * 2. Proteção de rota: redireciona pra /login quem tenta acessar `(app)`
 *    sem sessão válida. Isso é UX (evita renderizar a página só pra
 *    redirecionar depois) — nunca a única barreira. A barreira real é
 *    `getCurrentUser()`/`getCurrentTenant()` (lib/auth/session.ts) sendo
 *    chamado dentro de cada layout/Server Action, mais RLS no banco.
 *    Regra absoluta nº 10 do CLAUDE.md: autorização nunca depende só da
 *    interface (e middleware é, na prática, "interface").
 */

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

function isPublicPath(pathname: string) {
  // "/" é a home autenticada (app), não uma landing pública — ver
  // src/app/(app)/page.tsx. Portal do Cliente (futuro, público por
  // natureza) vai morar em /p/[tenantSlug].
  if (pathname.startsWith("/p/")) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() valida o JWT com o servidor Supabase Auth — nunca getSession()
  // aqui (só decodificaria o cookie local, sem confirmar que ainda é válido).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect_to", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
