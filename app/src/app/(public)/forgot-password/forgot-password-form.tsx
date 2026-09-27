"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ActionResult } from "@/server/auth/actions";
import { FormError } from "@/components/form-error";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => requestPasswordReset(formData),
    null,
  );

  if (state && "success" in state) {
    return (
      <p className="text-sm">
        Se existir uma conta com esse email, você vai receber um link pra redefinir a senha.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15"
        />
      </label>
      <FormError message={state && "error" in state ? state.error : undefined} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "Enviando..." : "Enviar link"}
      </button>
    </form>
  );
}
