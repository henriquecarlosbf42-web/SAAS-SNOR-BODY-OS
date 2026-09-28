"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import {
  archiveCustomer,
  archiveVehicle,
  type CrmActionResult,
} from "@/server/crm/actions";

export function ArchiveButton({
  id,
  recordType,
}: {
  id: string;
  recordType: "customer" | "vehicle";
}) {
  const action = recordType === "customer" ? archiveCustomer : archiveVehicle;
  const [state, formAction, pending] = useActionState<CrmActionResult | null, FormData>(
    async (_previous, formData) => action(formData),
    null,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Archive this ${recordType}? It will be hidden from active lists.`)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-start gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <FormError message={state && "error" in state ? state.error : undefined} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-red-700 underline underline-offset-4 disabled:opacity-60 dark:text-red-400"
      >
        {pending ? "Archiving..." : "Archive"}
      </button>
    </form>
  );
}
