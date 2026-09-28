import { notFound } from "next/navigation";
import { ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/rbac";
import { getCurrentTenant } from "@/lib/auth/session";
import { AiAgentSettingsForm } from "@/features/ai-agent/components/ai-agent-settings-form";
import { getAiAgentConfiguration } from "@/server/ai-agent/data";

export default async function AiAgentSettingsPage() {
  try {
    await requirePermission("configuracoes:read");
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const tenant = await getCurrentTenant();
  const result = await getAiAgentConfiguration(tenant.id);
  if (!result) notFound();

  return (
    <section className="mx-auto max-w-4xl">
      <p className="text-sm text-black/55 dark:text-white/55">Tenant settings</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">AI Agent</h1>
      <p className="mt-2 mb-8 text-sm text-black/65 dark:text-white/65">
        Configure this tenant&apos;s assistant, business details, instructions, and knowledge.
      </p>
      <div className="rounded-xl border border-black/10 p-6 dark:border-white/10">
        <AiAgentSettingsForm configuration={result.configuration} />
      </div>
    </section>
  );
}
