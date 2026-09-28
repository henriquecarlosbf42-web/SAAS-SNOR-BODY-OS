import Link from "next/link";
import { ConversationStatusBadge } from "@/features/conversations/components/status-badge";
import { NewConversationForm } from "@/features/conversations/components/new-conversation-form";
import { getInbox } from "@/server/conversations/queries";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function InboxPage() {
  const { conversations, canWrite } = await getInbox();

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-8">
        <p className="text-sm text-black/55 dark:text-white/55">Customer communication</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-2 text-sm text-black/65 dark:text-white/65">
          Manage lead conversations and hand them over to your team.
        </p>
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
          {conversations.length === 0 ? (
            <p className="p-8 text-sm text-black/60 dark:text-white/60">
              No conversations yet. Start one by adding a lead.
            </p>
          ) : (
            <ul className="divide-y divide-black/10 dark:divide-white/10">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/inbox/${conversation.id}`}
                    className="flex flex-col gap-3 p-5 hover:bg-black/[0.025] sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/[0.025]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-medium">{conversation.leadName}</h2>
                        <ConversationStatusBadge status={conversation.status} />
                        {conversation.unreadCount > 0 ? (
                          <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white">
                            {conversation.unreadCount} unread
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-black/60 dark:text-white/60">
                        {conversation.lastMessage ?? "No messages yet"}
                      </p>
                    </div>
                    <div className="shrink-0 text-left text-xs text-black/50 sm:text-right dark:text-white/50">
                      <p>{conversation.assignedAgentName ?? "Unassigned"}</p>
                      <p className="mt-1">{formatDate(conversation.lastMessageAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {canWrite ? <NewConversationForm /> : null}
      </div>
    </section>
  );
}
