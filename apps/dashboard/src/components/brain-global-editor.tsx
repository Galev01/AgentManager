"use client";

import { useEffect, useState } from "react";
import { useBridgeEvents } from "@/lib/ws-client";
import type { GlobalBrain, GlobalBrainUpdate } from "@openclaw-manager/types";

type EditorState = {
  persona: string;
  hardRules: string;
  globalFacts: string;
  toneStyle: string;
  doNotSay: string;
  defaultGoals: string;
};

function toEditor(b: GlobalBrain): EditorState {
  return {
    persona: b.persona,
    hardRules: b.hardRules.join("\n"),
    globalFacts: b.globalFacts.join("\n"),
    toneStyle: b.toneStyle,
    doNotSay: b.doNotSay.join("\n"),
    defaultGoals: b.defaultGoals.join("\n"),
  };
}

function toUpdate(e: EditorState): GlobalBrainUpdate {
  const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    persona: e.persona,
    hardRules: split(e.hardRules),
    globalFacts: split(e.globalFacts),
    toneStyle: e.toneStyle,
    doNotSay: split(e.doNotSay),
    defaultGoals: split(e.defaultGoals),
  };
}

export function GlobalBrainEditor({
  initial,
  onSaved,
}: {
  initial: GlobalBrain;
  onSaved?: (next: GlobalBrain) => void;
}) {
  const [server, setServer] = useState<GlobalBrain>(initial);
  const [edit, setEdit] = useState<EditorState>(() => toEditor(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    setServer(initial);
    setEdit(toEditor(initial));
    setDirty(false);
  }, [initial]);

  useBridgeEvents((msg) => {
    if (msg.type !== "brain_agent_changed") return;
    void (async () => {
      try {
        const res = await fetch("/api/brain/agent", { cache: "no-store" });
        if (!res.ok) return;
        const fresh: GlobalBrain = await res.json();
        setServer(fresh);
        if (!dirty) setEdit(toEditor(fresh));
        else setBanner("Global brain changed on disk — your edits are kept. Click Save to overwrite.");
      } catch { /* ignore */ }
    })();
  });

  function update<K extends keyof EditorState>(k: K, v: EditorState[K]) {
    setEdit((p) => ({ ...p, [k]: v }));
    setDirty(true);
    setBanner(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toUpdate(edit)),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      const fresh: GlobalBrain = await res.json();
      setServer(fresh);
      setEdit(toEditor(fresh));
      setDirty(false);
      setBanner(null);
      onSaved?.(fresh);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  function handleDiscard() { setEdit(toEditor(server)); setDirty(false); setBanner(null); }

  const inputClass = "w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none";
  const textareaClass = inputClass + " font-mono leading-relaxed";

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div>}
      {banner && <div className="rounded border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">{banner}</div>}
      {server.parseWarning && (
        <div className="rounded border border-orange-700 bg-orange-900/20 px-4 py-3 text-sm text-orange-200">
          Note had a parsing issue: <code className="font-mono">{server.parseWarning}</code>. Displaying best-effort data.
        </div>
      )}

      <Section label="Persona"><textarea rows={3} className={textareaClass} value={edit.persona} onChange={(e) => update("persona", e.target.value)} /></Section>
      <Section label="Hard Rules" hint="One per line."><textarea rows={5} className={textareaClass} value={edit.hardRules} onChange={(e) => update("hardRules", e.target.value)} /></Section>
      <Section label="Global Facts" hint="One per line."><textarea rows={5} className={textareaClass} value={edit.globalFacts} onChange={(e) => update("globalFacts", e.target.value)} /></Section>
      <Section label="Tone / Style"><textarea rows={3} className={textareaClass} value={edit.toneStyle} onChange={(e) => update("toneStyle", e.target.value)} /></Section>
      <Section label="Do Not Say" hint="One phrase per line. Runtime filter lives in the gateway (phase 2); this file is the source of truth for the phrases."><textarea rows={5} className={textareaClass} value={edit.doNotSay} onChange={(e) => update("doNotSay", e.target.value)} /></Section>
      <Section label="Default Goals" hint="One per line."><textarea rows={4} className={textareaClass} value={edit.defaultGoals} onChange={(e) => update("defaultGoals", e.target.value)} /></Section>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/95 px-4 py-3 backdrop-blur">
        <span className="text-xs text-zinc-400">{dirty ? "Unsaved changes" : "All saved"}</span>
        <div className="flex-1" />
        <button onClick={handleDiscard} disabled={!dirty || saving} className="rounded px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">Discard</button>
        <button onClick={handleSave} disabled={!dirty || saving} className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      {hint && <span className="mb-2 block text-xs text-zinc-500">{hint}</span>}
      {children}
    </label>
  );
}
