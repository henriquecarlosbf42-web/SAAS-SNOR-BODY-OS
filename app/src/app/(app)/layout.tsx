import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

/**
 * Camada de proteção da área autenticada — a que de fato importa (o
 * middleware só evita renderizar a página à toa; esta é a que
 * `getCurrentUser()` consulta o Supabase Auth de verdade). Resolução de
 * tenant/membership/role fica por conta de cada página (ETAPA 04) — não
 * antecipamos aqui pra não obrigar toda rota autenticada a já ter uma
 * membership válida (ex.: uma futura tela de "criar meu primeiro
 * tenant" também vive dentro de `(app)`).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-8">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            SNOR FUNILARIA
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm">
            <Link
              href="/customers"
              className="text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"
            >
              Customers
            </Link>
            <Link
              href="/vehicles"
              className="text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"
            >
              Vehicles
            </Link>
            <Link
              href="/inbox"
              className="text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"
            >
              Inbox
            </Link>
            <Link
              href="/settings/ai-agent"
              className="text-black/65 hover:text-black dark:text-white/65 dark:hover:text-white"
            >
              AI Agent
            </Link>
          </nav>
        </div>
        <LogoutButton />
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
