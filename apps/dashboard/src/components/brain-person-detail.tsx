"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBridgeEvents } from "@/lib/ws-client";
import type { BrainPerson, BrainPersonStatus, BrainPersonUpdate } from "@openclaw-manager/types";

type EditableLines = string; // newline-separated bullets

type EditorState = {
  name: string;
  relationship: string;
  language: string;
  status: BrainPersonStatus;
  summary: string;
  facts: EditableLines;
  preferences: EditableLines;
  openThreads: EditableLines;
  notes: string;
  cursing: boolean;
  cursingRate: number;
  curses: EditableLines;
};

function toEditor(person: BrainPerson): EditorState {
  return {
    name: person.name,
    relationship: person.relationship ?? "",
    language: person.language ?? "",
    status: person.status,
    summary: person.summary,
    facts: person.facts.join("\n"),
    preferences: person.preferences.join("\n"),
    openThreads: person.openThreads.join("\n"),
    notes: person.notes,
    cursing: person.cursing === true,
    cursingRate: typeof person.cursingRate === "number" ? person.cursingRate : 70,
    curses: (person.curses ?? []).join("\n"),
  };
}

function toUpdate(edit: EditorState): BrainPersonUpdate {
  return {
    name: edit.name.trim() || undefined,
    relationship: edit.relationship.trim() === "" ? null : edit.relationship.trim(),
    language: edit.language.trim() === "" ? null : edit.language.trim(),
    status: edit.status,
    summary: edit.summary,
    facts: edit.facts.split("\n").map((s) => s.trim()).filter(Boolean),
    preferences: edit.preferences.split("\n").map((s) => s.trim()).filter(Boolean),
    openThreads: edit.openThreads.split("\n").map((s) => s.trim()).filter(Boolean),
    notes: edit.notes,
    cursing: edit.cursing,
    cursingRate: edit.cursingRate,
    curses: edit.curses.split("\n").map((s) => s.trim()).filter(Boolean),
  };
}

export function BrainPersonDetail({ initial }: { initial: BrainPerson }) {
  const [person, setPerson] = useState<BrainPerson>(initial);
  const [edit, setEdit] = useState<EditorState>(() => toEditor(initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logEntry, setLogEntry] = useState("");
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/brain/people/${encodeURIComponent(person.phone)}`, { cache: "no-store" });
      if (!res.ok) return;
      const fresh: BrainPerson = await res.json();
      setPerson(fresh);
      if (!dirty) {
        setEdit(toEditor(fresh));
      } else {
        setBanner("The note changed on disk — your local edits are kept. Click Save to overwrite, or Discard to reload.");
      }
    } catch {
      // ignore
    }
  }, [person.phone, dirty]);

  useBridgeEvents((msg) => {
    if (msg.type !== "brain_person_changed" && msg.type !== "brain_person_removed") return;
    const payload = msg.payload as { phone?: string } | null;
    if (!payload || payload.phone !== person.phone) return;
    if (msg.type === "brain_person_removed") {
      setBanner("This note was removed on disk.");
      return;
    }
    void refresh();
  });

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEdit((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setBanner(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brain/people/${encodeURIComponent(person.phone)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toUpdate(edit)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      const updated: BrainPerson = await res.json();
      setPerson(updated);
      setEdit(toEditor(updated));
      setDirty(false);
      setBanner(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAppendLog() {
    const entry = logEntry.trim();
    if (!entry) return;
    setAppending(true);
    setError(null);
    try {
      const res = await fetch(`/api/brain/people/${encodeURIComponent(person.phone)}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to append log");
      }
      const updated: BrainPerson = await res.json();
      setPerson(updated);
      if (!dirty) setEdit(toEditor(updated));
      setLogEntry("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAppending(false);
    }
  }

  function handleDiscard() {
    setEdit(toEditor(person));
    setDirty(false);
    setBanner(null);
  }

  useEffect(() => {
    setEdit(toEditor(initial));
    setPerson(initial);
    setDirty(false);
  }, [initial]);

  const logReversed = useMemo(() => [...person.log].reverse(), [person.log]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200">Dismiss</button>
        </div>
      )}
      {banner && (
        <div className="rounded border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
          {banner}
        </div>
      )}
      {person.parseWarning && (
        <div className="rounded border border-orange-700 bg-orange-900/20 px-4 py-3 text-sm text-orange-200">
          Note had a parsing issue: <code className="font-mono">{person.parseWarning}</code>. Displaying best-effort data.
        </div>
      )}

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              type="text"
              value={edit.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone (read-only)">
            <input type="text" value={person.phone} readOnly className={inputClass + " text-zinc-400 font-mono"} />
          </Field>
          <Field label="Relationship">
            <input
              type="text"
              value={edit.relationship}
              onChange={(e) => update("relationship", e.target.value)}
              placeholder="customer / friend / lead / vendor / other"
              className={inputClass}
            />
          </Field>
          <Field label="Language">
            <input
              type="text"
              value={edit.language}
              onChange={(e) => update("language", e.target.value)}
              placeholder="he / en / …"
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <select
              value={edit.status}
              onChange={(e) => update("status", e.target.value as BrainPersonStatus)}
              className={inputClass}
            >
              <option value="active">active</option>
              <option value="archived">archived</option>
              <option value="blocked">blocked</option>
            </select>
          </Field>
          <Field label="Last seen (read-only)">
            <input type="text" value={person.lastSeen || "—"} readOnly className={inputClass + " text-zinc-400"} />
          </Field>
        </div>
      </div>

      <Section title="Summary" hint="One paragraph the agent reads before replying.">
        <textarea
          value={edit.summary}
          onChange={(e) => update("summary", e.target.value)}
          rows={4}
          className={textareaClass}
        />
      </Section>

      <Section title="Facts" hint="One bullet per line. Injected into the agent's context.">
        <textarea
          value={edit.facts}
          onChange={(e) => update("facts", e.target.value)}
          rows={5}
          className={textareaClass}
          placeholder="Lives in Tel Aviv\nPrefers short replies"
        />
      </Section>

      <Section title="Preferences" hint="One per line.">
        <textarea
          value={edit.preferences}
          onChange={(e) => update("preferences", e.target.value)}
          rows={4}
          className={textareaClass}
        />
      </Section>

      <Section title="Open Threads" hint="One per line.">
        <textarea
          value={edit.openThreads}
          onChange={(e) => update("openThreads", e.target.value)}
          rows={4}
          className={textareaClass}
        />
      </Section>

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Curses (canned replies)</h3>
            <p className="mt-1 text-xs text-zinc-500">
              When the toggle is on and the list has at least one entry, the bot replies with a random line for{" "}
              <span className="font-mono text-zinc-300">{edit.cursingRate}%</span> of this contact's messages, skipping the AI entirely. The remaining {100 - edit.cursingRate}% fall through to the normal AI reply.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={edit.cursing}
              onChange={(e) => update("cursing", e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-0 focus:ring-offset-0"
            />
            <span>Reply with random curse</span>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <label className="text-xs uppercase tracking-wider text-zinc-400 shrink-0">
            Curse rate
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={edit.cursingRate}
            onChange={(e) => update("cursingRate", Number(e.target.value))}
            disabled={!edit.cursing}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-700 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={edit.cursingRate}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) update("cursingRate", Math.max(0, Math.min(100, Math.round(n))));
            }}
            disabled={!edit.cursing}
            className={inputClass + " w-20 text-right font-mono disabled:opacity-50"}
          />
          <span className="text-xs text-zinc-400">%</span>
        </div>

        <textarea
          value={edit.curses}
          onChange={(e) => update("curses", e.target.value)}
          rows={6}
          placeholder="One per line, e.g.&#10;סתום את הפה&#10;לוזר רציני&#10;תתחדש"
          className={textareaClass + " mt-4"}
        />
      </div>

      <Section title="Notes" hint="Free-form. NOT injected into the agent. Use for your private scratch.">
        <textarea
          value={edit.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={6}
          className={textareaClass}
        />
      </Section>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/95 px-4 py-3 backdrop-blur">
        <span className="text-xs text-zinc-400">
          {dirty ? "Unsaved changes" : "All saved"}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleDiscard}
          disabled={!dirty || saving}
          className="rounded px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-100">Log</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Append-only. The agent writes here via <code className="font-mono">[[[BRAIN: fact]]]</code> in its replies.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={logEntry}
            onChange={(e) => setLogEntry(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAppendLog()}
            placeholder="Add a log line…"
            className={inputClass + " flex-1"}
          />
          <button
            onClick={handleAppendLog}
            disabled={appending || !logEntry.trim()}
            className="rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
          >
            {appending ? "Appending…" : "Append"}
          </button>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-zinc-200">
          {logReversed.length === 0 && <li className="text-zinc-500 text-xs">No log entries yet.</li>}
          {logReversed.map((entry, i) => (
            <li key={i} className="font-mono text-xs text-zinc-300 leading-relaxed">
              {entry}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none";
const textareaClass = inputClass + " font-mono leading-relaxed";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      {hint && <p className="mb-3 text-xs text-zinc-500">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </div>
  );
}
