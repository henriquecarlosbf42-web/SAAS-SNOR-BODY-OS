"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { sendAgentMessage, type ConversationActionResult } from "@/server/conversations/actions";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ConversationActionResult | null, FormData>(
    async (_previous, formData) => sendAgentMessage(formData),
    null,
  );

  useEffect(() => {
    if (state && "success" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 border-t border-black/10 pt-5 dark:border-white/10"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="message-content" className="text-sm font-medium">
        Reply as agent
      </label>
      <textarea
        id="message-content"
        name="content"
        rows={3}
        maxLength={10000}
        required
        placeholder="Write a reply..."
        className="w-full resize-y rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FormError message={state && "error" in state ? state.error : undefined} />
          {state && "success" in state ? (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              Message sent.
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Sending..." : "Send reply"}
        </button>
      </div>
    </form>
  );
}
