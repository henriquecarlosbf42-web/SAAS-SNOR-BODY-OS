"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { markConversationRead } from "@/server/conversations/actions";

export function MarkReadOnOpen({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    markConversationRead(conversationId)
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        if (active) setError("Could not update the read status. Refresh and try again.");
      });

    return () => {
      active = false;
    };
  }, [conversationId, router]);

  return error ? (
    <p role="alert" className="text-sm text-red-700 dark:text-red-400">
      {error}
    </p>
  ) : null;
}
