"use client";

import { useActionState, useMemo, useState } from "react";
import { FormError } from "@/components/form-error";
import type { Vehicle } from "@/lib/domains/crm";
import type { Quote } from "@/lib/domains/orcamento";
import { createQuote, updateQuote, type OrcamentoActionResult } from "@/server/orcamento/actions";

export function QuoteForm({
  vehicles,
  quote,
  selectedVehicleId,
}: {
  vehicles: Vehicle[];
  quote?: Quote;
  selectedVehicleId?: string;
}) {
  const action = quote ? updateQuote : createQuote;
  const [state, formAction, pending] = useActionState<OrcamentoActionResult | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );

  const [vehicleId, setVehicleId] = useState(quote?.vehicleId ?? selectedVehicleId ?? "");
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId),
    [vehicles, vehicleId],
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {quote ? <input type="hidden" name="id" value={quote.id} /> : null}
      <input type="hidden" name="customerId" value={selectedVehicle?.customerId ?? ""} />
      <label className="flex flex-col gap-1.5 text-sm">
        Vehicle
        <select
          name="vehicleId"
          required
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Select a vehicle
          </option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.year} {vehicle.make} {vehicle.model} — {vehicle.customerName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Service category
        <input
          name="serviceCategory"
          required
          maxLength={120}
          placeholder="Collision repair, paint job, ..."
          defaultValue={quote?.serviceCategory}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Damage description
        <textarea
          name="damageDescription"
          required
          rows={4}
          maxLength={5000}
          defaultValue={quote?.damageDescription}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          Estimated price
          <input
            name="estimatedPrice"
            type="number"
            min={0}
            step="0.01"
            defaultValue={quote?.estimatedPrice ?? ""}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Estimated days
          <input
            name="estimatedDays"
            type="number"
            min={0}
            defaultValue={quote?.estimatedDays ?? ""}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        Shop notes
        <textarea
          name="shopNotes"
          rows={3}
          maxLength={5000}
          defaultValue={quote?.shopNotes ?? ""}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <FormError message={state && "error" in state ? state.error : undefined} />
      {state && "success" in state ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Quote saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || vehicles.length === 0}
        className="w-fit rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving..." : quote ? "Save changes" : "Create quote"}
      </button>
    </form>
  );
}
