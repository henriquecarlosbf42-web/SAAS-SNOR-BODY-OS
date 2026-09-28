"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import type { CustomerOption, Vehicle } from "@/lib/domains/crm";
import { createVehicle, updateVehicle, type CrmActionResult } from "@/server/crm/actions";

export function VehicleForm({
  customers,
  vehicle,
  selectedCustomerId,
}: {
  customers: CustomerOption[];
  vehicle?: Vehicle;
  selectedCustomerId?: string;
}) {
  const action = vehicle ? updateVehicle : createVehicle;
  const [state, formAction, pending] = useActionState<CrmActionResult | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {vehicle ? <input type="hidden" name="id" value={vehicle.id} /> : null}
      <label className="flex flex-col gap-1.5 text-sm">
        Customer
        <select
          name="customerId"
          required
          defaultValue={vehicle?.customerId ?? selectedCustomerId ?? ""}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Select a customer
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          Make
          <input
            name="make"
            required
            maxLength={120}
            defaultValue={vehicle?.make}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Model
          <input
            name="model"
            required
            maxLength={120}
            defaultValue={vehicle?.model}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Year
          <input
            name="year"
            type="number"
            required
            min={1886}
            max={2100}
            defaultValue={vehicle?.year ?? new Date().getFullYear()}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Color
          <input
            name="color"
            maxLength={80}
            defaultValue={vehicle?.color ?? ""}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          VIN
          <input
            name="vin"
            maxLength={32}
            defaultValue={vehicle?.vin ?? ""}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          License plate
          <input
            name="plate"
            maxLength={20}
            defaultValue={vehicle?.plate ?? ""}
            className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
          />
        </label>
      </div>
      <FormError message={state && "error" in state ? state.error : undefined} />
      {state && "success" in state ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Vehicle saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || customers.length === 0}
        className="w-fit rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving..." : vehicle ? "Save changes" : "Create vehicle"}
      </button>
    </form>
  );
}
