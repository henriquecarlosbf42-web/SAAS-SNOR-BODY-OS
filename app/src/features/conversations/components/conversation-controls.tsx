"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormError } from "@/components/form-error";
import type { ConversationAgent, ConversationStatus } from "@/lib/domains/conversations";
import { activateAiForConversation } from "@/server/ai-agent/actions";
import {
  assignConversation,
  changeConversationStatus,
  takeOverConversation,
  type ConversationActionResult,
} from "@/server/conversations/actions";

function ActionFeedback({ result }: { result: ConversationActionResult | null }) {
  if (result && "error" in result) return <FormError message={result.error} />;
  if (result && "success" in result) {
    return (
      <p role="status" className="text-xs text-green-700 dark:text-green-400">
        Updated.
      </p>
    );
  }
  return null;
}

export function ConversationControls({
  conversationId,
  assignedTo,
  status,
  agents,
  aiEnabled,
}: {
  conversationId: string;
  assignedTo: string | null;
  status: ConversationStatus;
  agents: ConversationAgent[];
  aiEnabled: boolean;
}) {
  const [assignmentResult, assignAction, assigning] = useActionState<
    ConversationActionResult | null,
    FormData
  >(async (_previous, formData) => assignConversation(formData), null);
  const [takeoverResult, takeoverAction, takingOver] = useActionState<
    ConversationActionResult | null,
    FormData
  >(async (_previous, formData) => takeOverConversation(formData), null);
  const [statusResult, statusAction, changingStatus] = useActionState<
    ConversationActionResult | null,
    FormData
  >(async (_previous, formData) => changeConversationStatus(formData), null);
  const [aiResult, activateAiAction, activatingAi] = useActionState<
    import("@/server/ai-agent/actions").AiAgentActionResult | null,
    FormData
  >(async () => activateAiForConversation(conversationId), null);

  return (
    <div className="flex flex-col gap-4">
      <form action={assignAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-black/60 dark:text-white/60">
          Assigned agent
          <select
            name="agentId"
            required
            defaultValue={assignedTo ?? ""}
            className="rounded-md border border-black/15 bg-white px-2 py-2 text-sm text-black dark:border-white/15 dark:bg-zinc-900 dark:text-white"
          >
            <option value="" disabled>
              Select an agent
            </option>
            {agents.map((agent) => (
              <option key={agent.userId} value={agent.userId}>
                {agent.name} · {agent.role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={assigning || agents.length === 0}
          className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/15"
        >
          {assigning ? "Assigning..." : "Assign"}
        </button>
        <ActionFeedback result={assignmentResult} />
      </form>

      <div className="flex flex-wrap items-center gap-3">
        {status !== "AI_ACTIVE" && status !== "CLOSED" ? (
          aiEnabled ? (
            <form action={activateAiAction}>
              <button
                type="submit"
                disabled={activatingAi}
                className="rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {activatingAi ? "Activating AI..." : "Activate AI"}
              </button>
              <ActionFeedback result={aiResult} />
            </form>
          ) : (
            <Link
              href="/settings/ai-agent"
              className="text-sm text-violet-700 underline dark:text-violet-300"
            >
              Configure and enable AI
            </Link>
          )
        ) : null}
        {status !== "HUMAN_ACTIVE" && status !== "CLOSED" ? (
          <form action={takeoverAction}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <button
              type="submit"
              disabled={takingOver}
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {takingOver ? "Taking over..." : "Take over"}
            </button>
            <ActionFeedback result={takeoverResult} />
          </form>
        ) : null}
        {status === "CLOSED" || status === "OPEN" ? (
          <form action={statusAction} className="flex items-center gap-2">
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="status" value={status === "CLOSED" ? "OPEN" : "CLOSED"} />
            <button
              type="submit"
              disabled={changingStatus}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-60 dark:border-white/15"
            >
              {changingStatus
                ? "Updating..."
                : status === "CLOSED"
                  ? "Reopen"
                  : "Close conversation"}
            </button>
            <ActionFeedback result={statusResult} />
          </form>
        ) : null}
      </div>
    </div>
  );
}
