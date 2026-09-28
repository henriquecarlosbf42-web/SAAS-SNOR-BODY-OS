"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { saveAiAgentSettings, type AiAgentActionResult } from "@/server/ai-agent/actions";
import type { AiAgentConfiguration } from "@/lib/domains/ai-agent";

export function AiAgentSettingsForm({ configuration }: { configuration: AiAgentConfiguration }) {
  const [state, formAction, pending] = useActionState<AiAgentActionResult | null, FormData>(
    async (_previous, formData) => saveAiAgentSettings(formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Agent name
          <input
            name="name"
            defaultValue={configuration.name}
            maxLength={120}
            required
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tone
          <input
            name="tone"
            defaultValue={configuration.tone}
            maxLength={500}
            required
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Language
          <input
            name="language"
            defaultValue={configuration.language}
            maxLength={80}
            required
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Service area
          <input
            name="serviceArea"
            defaultValue={configuration.serviceArea}
            maxLength={1000}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Business description
        <textarea
          name="businessDescription"
          defaultValue={configuration.businessDescription}
          rows={3}
          maxLength={5000}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Services (one per line)
        <textarea
          name="servicesText"
          defaultValue={configuration.servicesText.join("\n")}
          rows={4}
          maxLength={10000}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Business hours
        <textarea
          name="businessHours"
          defaultValue={configuration.businessHours}
          rows={3}
          maxLength={2000}
          placeholder="Monday-Friday, 9:00 AM-5:00 PM"
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tenant instructions (cannot override system safety rules)
        <textarea
          name="instructions"
          defaultValue={configuration.instructions}
          rows={4}
          maxLength={20000}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Business knowledge (facts and reference information)
        <textarea
          name="knowledge"
          defaultValue={configuration.knowledge}
          rows={6}
          maxLength={20000}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={configuration.enabled} />
        Enable this tenant&apos;s AI agent
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save AI agent"}
        </button>
        <FormError message={state && "error" in state ? state.error : undefined} />
        {state && "success" in state ? (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            AI agent settings saved.
          </p>
        ) : null}
      </div>
      <p className="text-xs text-black/55 dark:text-white/55">
        The OpenAI API key is configured only on the server and is never shown here.
      </p>
    </form>
  );
}
