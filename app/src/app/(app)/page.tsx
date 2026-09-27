import { getCurrentRole, getCurrentTenant } from "@/lib/auth/session";
import {
  AmbiguousTenantError,
  NoMembershipError,
  TenantInactiveError,
} from "@/lib/auth/errors";
import type { Role, Tenant } from "@/lib/auth/types";

type AppHomeResult =
  | { kind: "ok"; tenant: Tenant; role: Role }
  | { kind: "no-membership" }
  | { kind: "ambiguous" }
  | { kind: "inactive"; status: string };

// Separado do componente pra manter a construção de JSX inteiramente fora
// do try/catch (regra do eslint react-hooks/error-boundaries) — o
// try/catch aqui só resolve dados, nunca decide o que renderizar.
async function loadAppHome(): Promise<AppHomeResult> {
  try {
    const [tenant, role] = await Promise.all([getCurrentTenant(), getCurrentRole()]);
    return { kind: "ok", tenant, role };
  } catch (error) {
    if (error instanceof NoMembershipError) return { kind: "no-membership" };
    if (error instanceof AmbiguousTenantError) return { kind: "ambiguous" };
    if (error instanceof TenantInactiveError) return { kind: "inactive", status: error.status };
    throw error;
  }
}

/**
 * Placeholder da área autenticada — só prova que autenticação + tenant
 * resolution + RBAC estão funcionando de ponta a ponta. Nenhum módulo de
 * negócio (CRM/orçamento/ERP) implementado aqui, como pedido.
 */
export default async function AppHomePage() {
  const result = await loadAppHome();

  if (result.kind === "no-membership") {
    return <p>Sua conta ainda não está associada a nenhuma oficina.</p>;
  }
  if (result.kind === "ambiguous") {
    return <p>Você pertence a mais de uma oficina — escolha qual quer ver (em breve).</p>;
  }
  if (result.kind === "inactive") {
    return <p>A oficina associada à sua conta está com o status &quot;{result.status}&quot;.</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Bem-vindo, {result.tenant.name}</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">Seu papel: {result.role}</p>
    </div>
  );
}
