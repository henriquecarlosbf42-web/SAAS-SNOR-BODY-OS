"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormError } from "@/components/form-error";
import {
  createLeadConversation,
  type ConversationActionResult,
} from "@/server/conversations/actions";

export function NewConversationForm() {
  const [state, formAction, pending] = useActionState<ConversationActionResult | null, FormData>(
    async (_previous, formData) => createLeadConversation(formData),
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
    >
      <h2 className="font-medium">Start a conversation</h2>
      <label className="flex flex-col gap-1 text-sm">
        Lead name
        <input
          name="name"
          required
          maxLength={200}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          maxLength={320}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Phone
        <input
          name="phone"
          type="tel"
          maxLength={40}
          className="rounded-md border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
        />
      </label>
      <FormError message={state && "error" in state ? state.error : undefined} />
      {state && "success" in state && state.id ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Conversation created.{" "}
          <Link className="underline" href={`/inbox/${state.id}`}>
            Open it
          </Link>
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create conversation"}
      </button>
    </form>
  );
}
