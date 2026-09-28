"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import type { Customer } from "@/lib/domains/crm";
import { createCustomer, updateCustomer, type CrmActionResult } from "@/server/crm/actions";

export function CustomerForm({ customer }: { customer?: Customer }) {
  const action = customer ? updateCustomer : createCustomer;
  const [state, formAction, pending] = useActionState<CrmActionResult | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm">
        Name
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={customer?.name}
          autoComplete="name"
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            name="email"
            type="email"
            maxLength={320}
            defaultValue={customer?.email ?? ""}
            autoComplete="email"
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Phone
          <input
            name="phone"
            type="tel"
            maxLength={40}
            defaultValue={customer?.phone ?? ""}
            autoComplete="tel"
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        Notes
        <textarea
          name="notes"
          rows={5}
          maxLength={5000}
          defaultValue={customer?.notes ?? ""}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <FormError message={state && "error" in state ? state.error : undefined} />
      {state && "success" in state ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Customer saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving..." : customer ? "Save changes" : "Create customer"}
      </button>
    </form>
  );
}
