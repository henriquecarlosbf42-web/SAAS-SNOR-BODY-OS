"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signInWithOAuth, type ActionResult } from "@/server/auth/actions";
import { FormError } from "@/components/form-error";

const initialState: ActionResult = { success: true };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => signIn(formData),
    initialState,
  );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
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
        <label className="flex flex-col gap-1 text-sm">
          Senha
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15"
          />
        </label>
        {"error" in state && <FormError message={state.error} />}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <form
          action={async () => {
            await signInWithOAuth("google");
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Continuar com Google
          </button>
        </form>
        <form
          action={async () => {
            await signInWithOAuth("microsoft");
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Continuar com Microsoft
          </button>
        </form>
      </div>

      <div className="flex justify-between text-sm">
        <Link href="/signup" className="underline">
          Criar conta
        </Link>
        <Link href="/forgot-password" className="underline">
          Esqueci minha senha
        </Link>
      </div>
    </div>
  );
}
