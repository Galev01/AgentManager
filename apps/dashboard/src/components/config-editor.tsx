"use client";

import { useState, useCallback } from "react";
import type { ConfigSchema } from "@openclaw-manager/types";

type ViewMode = "form" | "raw";

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function FormField({
  propKey,
  def,
  value,
  onChange,
}: {
  propKey: string;
  def: { type: string; description?: string; default?: unknown; enum?: unknown[] };
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const label = formatLabel(propKey);
  const inputClass =
    "w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none";

  let input: React.ReactNode;

  if (def.enum && def.enum.length > 0) {
    input = (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(propKey, e.target.value)}
        className={inputClass}
      >
        <option value="">— select —</option>
        {def.enum.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
    );
  } else if (def.type === "boolean") {
    input = (
      <label className="flex cursor-pointer items-center gap-3">
        <div className="relative">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(propKey, e.target.checked)}
            className="sr-only"
          />
          <div
            className={`h-5 w-9 rounded-full transition ${
              value ? "bg-blue-600" : "bg-zinc-600"
            }`}
          />
          <div
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              value ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </div>
        <span className="text-sm text-zinc-300">{value ? "Enabled" : "Disabled"}</span>
      </label>
    );
  } else if (def.type === "number" || def.type === "integer") {
    input = (
      <input
        type="number"
        value={value != null ? String(value) : ""}
        onChange={(e) =>
          onChange(propKey, e.target.value === "" ? undefined : Number(e.target.value))
        }
        className={inputClass}
      />
    );
  } else if (def.type === "object" || def.type === "array") {
    input = (
      <textarea
        rows={4}
        value={value != null ? JSON.stringify(value, null, 2) : ""}
        onChange={(e) => {
          try {
            onChange(propKey, JSON.parse(e.target.value));
          } catch {
            // ignore parse errors during typing
          }
        }}
        className={`${inputClass} font-mono text-xs resize-y`}
      />
    );
  } else {
    input = (
      <input
        type="text"
        value={value != null ? String(value) : ""}
        onChange={(e) => onChange(propKey, e.target.value)}
        className={inputClass}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-200">{label}</label>
      {def.description && (
        <p className="text-xs text-zinc-500">{def.description}</p>
      )}
      {input}
    </div>
  );
}

export function ConfigEditor({
  schema,
  values: initialValues,
}: {
  schema: ConfigSchema;
  values: Record<string, unknown>;
}) {
  const [mode, setMode] = useState<ViewMode>("form");
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [dirty, setDirty] = useState(false);
  const [rawText, setRawText] = useState(JSON.stringify(initialValues, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const properties = schema?.properties ?? {};

  const handleFieldChange = useCallback((key: string, val: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      setRawText(JSON.stringify(next, null, 2));
      return next;
    });
    setDirty(true);
    setFeedback(null);
  }, []);

  function handleRawChange(text: string) {
    setRawText(text);
    setFeedback(null);
  }

  function handleRawBlur() {
    try {
      const parsed = JSON.parse(rawText);
      setValues(parsed);
      setDirty(true);
      setRawError(null);
    } catch (e: any) {
      setRawError("Invalid JSON: " + e.message);
    }
  }

  function switchMode(next: ViewMode) {
    if (next === "raw") {
      setRawText(JSON.stringify(values, null, 2));
      setRawError(null);
    }
    setMode(next);
  }

  async function handleSave() {
    if (rawError) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gateway-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      setDirty(false);
      setFeedback({ type: "success", msg: "Configuration saved." });
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gateway-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Apply failed");
      }
      setFeedback({ type: "success", msg: "Configuration applied successfully." });
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 p-1 w-fit">
          {(["form", "raw"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`rounded px-4 py-2 text-sm font-medium transition ${
                mode === m
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
              }`}
            >
              {m === "form" ? "Form View" : "Raw JSON"}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-green-700 bg-green-900/30 text-green-300"
              : "border-red-700 bg-red-900/30 text-red-300"
          }`}
        >
          {feedback.msg}
          <button
            onClick={() => setFeedback(null)}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content */}
      {mode === "form" ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
          {Object.keys(properties).length === 0 ? (
            <p className="text-sm text-zinc-400">No configuration schema available.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {Object.entries(properties).map(([key, def]) => (
                <FormField
                  key={key}
                  propKey={key}
                  def={def}
                  value={values[key] ?? def.default}
                  onChange={handleFieldChange}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            rows={20}
            value={rawText}
            onChange={(e) => handleRawChange(e.target.value)}
            onBlur={handleRawBlur}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none resize-y"
            spellCheck={false}
          />
          {rawError && (
            <p className="text-xs text-red-400">{rawError}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || !!rawError}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {saving && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleApply}
          disabled={applying}
          className="rounded border border-zinc-600 bg-zinc-800 px-5 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {applying && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}
          {applying ? "Applying…" : "Apply"}
        </button>
        {dirty && !saving && (
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
