"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { receiveCustomerMessage, type AiAgentActionResult } from "@/server/ai-agent/actions";

export function CustomerMessageComposer({ conversationId }: { conversationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AiAgentActionResult | null, FormData>(
    async (_previous, formData) => receiveCustomerMessage(formData),
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
      <label htmlFor="customer-message-content" className="text-sm font-medium">
        Record incoming customer message
      </label>
      <textarea
        id="customer-message-content"
        name="content"
        rows={3}
        maxLength={10000}
        required
        placeholder="Enter a message received from this customer..."
        className="w-full resize-y rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-900"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <FormError message={state && "error" in state ? state.error : undefined} />
          {state && "success" in state ? (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {state.notice ?? "Customer message recorded."}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/15"
        >
          {pending ? "Recording..." : "Record message"}
        </button>
      </div>
      {pending ? (
        <p role="status" className="text-xs text-black/55 dark:text-white/55">
          {`AI response may take up to 30 seconds.`}
        </p>
      ) : null}
    </form>
  );
}
