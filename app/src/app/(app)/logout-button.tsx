"use client";

import { signOut } from "@/server/auth/actions";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className="rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
    >
      Sair
    </button>
  );
}
