"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { canTransitionQuoteStatus, QUOTE_STATUSES, type QuoteStatus } from "@/lib/domains/orcamento";
import { changeQuoteStatus, type OrcamentoActionResult } from "@/server/orcamento/actions";

export function QuoteStatusForm({ id, status }: { id: string; status: QuoteStatus }) {
  const [state, formAction, pending] = useActionState<OrcamentoActionResult | null, FormData>(
    async (_previous, formData) => changeQuoteStatus(formData),
    null,
  );

  const nextStatuses = QUOTE_STATUSES.filter((candidate) => canTransitionQuoteStatus(status, candidate));

  if (nextStatuses.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Status <strong>{status}</strong> is final — no further transitions.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex items-center gap-2 text-sm">
        Status
        <select
          name="status"
          defaultValue=""
          required
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Move to...
          </option>
          {nextStatuses.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Updating..." : "Update status"}
      </button>
      <FormError message={state && "error" in state ? state.error : undefined} />
    </form>
  );
}
