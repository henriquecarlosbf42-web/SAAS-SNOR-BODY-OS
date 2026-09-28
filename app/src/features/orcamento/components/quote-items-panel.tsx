"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import type { QuoteItem } from "@/lib/domains/orcamento";
import {
  createQuoteItem,
  deleteQuoteItem,
  type OrcamentoActionResult,
} from "@/server/orcamento/actions";

function currency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function AddItemForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, pending] = useActionState<OrcamentoActionResult | null, FormData>(
    async (_previous, formData) => createQuoteItem(formData),
    null,
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="quoteId" value={quoteId} />
      <label className="flex flex-col gap-1.5 text-sm">
        Description
        <input
          name="description"
          required
          maxLength={500}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Quantity
        <input
          name="quantity"
          type="number"
          min={1}
          defaultValue={1}
          required
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Unit price
        <input
          name="unitPrice"
          type="number"
          min={0}
          step="0.01"
          required
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-fit rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add item"}
      </button>
      <div className="sm:col-span-4">
        <FormError message={state && "error" in state ? state.error : undefined} />
      </div>
    </form>
  );
}

function DeleteItemButton({ id }: { id: string }) {
  const [, formAction, pending] = useActionState<OrcamentoActionResult | null, FormData>(
    async (_previous, formData) => deleteQuoteItem(formData),
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-red-700 underline underline-offset-4 disabled:opacity-60 dark:text-red-400"
      >
        {pending ? "Removing..." : "Remove"}
      </button>
    </form>
  );
}

export function QuoteItemsPanel({
  quoteId,
  items,
  editable,
}: {
  quoteId: string;
  items: QuoteItem[];
  editable: boolean;
}) {
  const total = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 ? (
        <p className="rounded-xl border border-black/10 p-5 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
          No line items yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/55 dark:bg-white/[0.04] dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit price</th>
                <th className="px-4 py-3 font-medium">Total</th>
                {editable ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{item.description}</td>
                  <td className="px-4 py-3">{item.quantity}</td>
                  <td className="px-4 py-3">{currency(item.unitPrice)}</td>
                  <td className="px-4 py-3">{currency(item.totalPrice)}</td>
                  {editable ? (
                    <td className="px-4 py-3">
                      <DeleteItemButton id={item.id} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-medium">
                  Total
                </td>
                <td className="px-4 py-3 font-semibold">{currency(total)}</td>
                {editable ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editable ? (
        <AddItemForm quoteId={quoteId} />
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          This quote is closed. Line items can no longer be changed.
        </p>
      )}
    </div>
  );
}
