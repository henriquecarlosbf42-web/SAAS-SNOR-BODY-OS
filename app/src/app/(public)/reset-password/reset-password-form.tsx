"use client";

import { useActionState } from "react";
import { updatePassword, type ActionResult } from "@/server/auth/actions";
import { FormError } from "@/components/form-error";

const initialState: ActionResult = { success: true };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => updatePassword(formData),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Nova senha
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15"
        />
      </label>
      {"error" in state && <FormError message={state.error} />}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
