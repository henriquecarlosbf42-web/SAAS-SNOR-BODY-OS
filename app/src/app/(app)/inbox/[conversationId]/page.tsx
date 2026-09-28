import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationControls } from "@/features/conversations/components/conversation-controls";
import { CustomerMessageComposer } from "@/features/conversations/components/customer-message-composer";
import { MarkReadOnOpen } from "@/features/conversations/components/mark-read-on-open";
import { MessageComposer } from "@/features/conversations/components/message-composer";
import { ConversationStatusBadge } from "@/features/conversations/components/status-badge";
import { getConversationDetails } from "@/server/conversations/queries";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const result = await getConversationDetails(conversationId);
  if (!result) notFound();

  const { conversation, agents, canWrite, aiEnabled } = result;

  return (
    <section className="mx-auto max-w-5xl">
      <Link href="/inbox" className="text-sm text-blue-700 underline dark:text-blue-400">
        Back to inbox
      </Link>
      <div className="mt-5 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{conversation.leadName}</h1>
            <ConversationStatusBadge status={conversation.status} />
            {conversation.unreadCount > 0 ? (
              <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white">
                {conversation.unreadCount} unread
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            {[conversation.leadEmail, conversation.leadPhone].filter(Boolean).join(" · ") ||
              "No contact details"}
          </p>
        </div>
      </div>

      <MarkReadOnOpen conversationId={conversation.id} />

      {canWrite ? (
        <div className="mb-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <ConversationControls
            conversationId={conversation.id}
            assignedTo={conversation.assignedTo}
            status={conversation.status}
            agents={agents}
            aiEnabled={aiEnabled}
          />
        </div>
      ) : (
        <p className="mb-6 text-sm text-black/60 dark:text-white/60">
          Assigned to {conversation.assignedAgentName ?? "no agent"}.
        </p>
      )}

      <div className="rounded-xl border border-black/10 dark:border-white/10">
        <div className="max-h-[60vh] min-h-64 space-y-4 overflow-y-auto p-5">
          {conversation.messages.length === 0 ? (
            <p className="py-16 text-center text-sm text-black/50 dark:text-white/50">
              No messages in this conversation yet.
            </p>
          ) : (
            conversation.messages.map((message) => {
              const isAgent = message.senderType !== "LEAD";
              return (
                <article
                  key={message.id}
                  className={`max-w-[85%] rounded-xl p-4 ${
                    isAgent
                      ? "ml-auto bg-blue-700 text-white"
                      : "bg-black/[0.05] text-black dark:bg-white/[0.07] dark:text-white"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs opacity-75">
                    <span>{message.senderName}</span>
                    <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                </article>
              );
            })
          )}
        </div>
        {canWrite && conversation.status === "HUMAN_ACTIVE" ? (
          <div className="p-5">
            <MessageComposer conversationId={conversation.id} />
          </div>
        ) : null}
        {canWrite && conversation.status !== "CLOSED" ? (
          <div className="p-5">
            <CustomerMessageComposer conversationId={conversation.id} />
          </div>
        ) : null}
        {conversation.status === "CLOSED" ? (
          <p className="border-t border-black/10 p-5 text-sm text-black/55 dark:border-white/10 dark:text-white/55">
            This conversation is closed. Reopen it before replying.
          </p>
        ) : null}
        {canWrite &&
        conversation.status !== "HUMAN_ACTIVE" &&
        conversation.status !== "AI_ACTIVE" &&
        conversation.status !== "CLOSED" ? (
          <p className="border-t border-black/10 p-5 text-sm text-black/55 dark:border-white/10 dark:text-white/55">
            Take over this conversation to send a human reply.
          </p>
        ) : null}
      </div>
    </section>
  );
}
