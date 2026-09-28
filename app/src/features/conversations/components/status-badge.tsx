import type { ConversationStatus } from "@/lib/domains/conversations";

const STATUS_LABELS: Record<ConversationStatus, string> = {
  OPEN: "Open",
  AI_ACTIVE: "AI active",
  HUMAN_ACTIVE: "Human active",
  CLOSED: "Closed",
};

const STATUS_STYLES: Record<ConversationStatus, string> = {
  OPEN: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  AI_ACTIVE: "bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-200",
  HUMAN_ACTIVE: "bg-green-100 text-green-900 dark:bg-green-400/15 dark:text-green-200",
  CLOSED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
