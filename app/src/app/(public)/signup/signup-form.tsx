"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type ActionResult } from "@/server/auth/actions";
import { FormError } from "@/components/form-error";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => signUp(formData),
    null,
  );

  if (state && "success" in state) {
    return (
      <p className="text-sm">
        Conta criada. Confira seu email pra confirmar o cadastro antes de entrar.
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
      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15"
        />
      </label>
      <FormError message={state && "error" in state ? state.error : undefined} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
      <p className="text-sm">
        Já tem conta?{" "}
        <Link href="/login" className="underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
