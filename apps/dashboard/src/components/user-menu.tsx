"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserMenu({ username, displayName }: { username: string; displayName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="sb-foot-avatar">{initials}</div>
        <div className="sb-foot-text">
          <div className="n">{displayName || username}</div>
          <div className="s mono">{username}</div>
        </div>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full mb-2 w-48 rounded border border-dark-border bg-dark-card p-2 shadow-card-dark"
        >
          <Link
            href="/change-password"
            onClick={() => setOpen(false)}
            className="block rounded px-3 py-2 text-sm hover:bg-dark"
          >
            Change password
          </Link>
          <button
            type="button"
            onClick={logout}
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-dark"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
