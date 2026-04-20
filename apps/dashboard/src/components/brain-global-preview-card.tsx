"use client";

import { InjectionPreview } from "./brain-injection-preview";

export function GlobalBrainPreviewCard() {
  return (
    <InjectionPreview
      load={async () => {
        const r = await fetch("/api/brain/agent/preview", { cache: "no-store" });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Failed");
        return r.json();
      }}
    />
  );
}
