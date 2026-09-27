import { redirect } from "next/navigation";
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
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <span className="text-sm font-medium">SNOR FUNILARIA</span>
        <LogoutButton />
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
