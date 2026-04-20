"use client";

import { useEffect, useState, type ReactNode } from "react";

export function CollapsibleCard({
  title,
  storageKey,
  defaultOpen = true,
  hint,
  actions,
  children,
}: {
  title: string;
  storageKey?: string;
  defaultOpen?: boolean;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "open") setOpen(true);
    else if (raw === "closed") setOpen(false);
  }, [storageKey]);

  function toggle() {
    setOpen((cur) => {
      const next = !cur;
      if (storageKey) window.localStorage.setItem(storageKey, next ? "open" : "closed");
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-zinc-700 bg-zinc-800">
      <header className="flex items-center gap-3 border-b border-zinc-700 px-5 py-3">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-100 hover:text-white"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          {title}
        </button>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
        <div className="flex-1" />
        {actions}
      </header>
      {open && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}
