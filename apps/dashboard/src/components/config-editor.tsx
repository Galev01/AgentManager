"use client";

import { useState, useCallback, useMemo } from "react";

type ViewMode = "form" | "raw";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  description?: string;
  title?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
};

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (_m, key, str, bool, num) => {
      if (key) return `<span class="text-sky-400">${key}</span>`;
      if (str) return `<span class="text-emerald-300">${str}</span>`;
      if (bool) return `<span class="text-amber-400">${bool}</span>`;
      if (num) return `<span class="text-fuchsia-300">${num}</span>`;
      return _m;
    },
  );
}

function effectiveType(s: JsonSchema | undefined): string | null {
  if (!s) return null;
  if (s.type) return Array.isArray(s.type) ? s.type[0] : s.type;
  if (s.anyOf) {
    const t = s.anyOf.map((x) => x.type).find(Boolean);
    if (t) return Array.isArray(t) ? t[0] : t;
  }
  return null;
}

function constEnumFromAnyOf(s: JsonSchema): unknown[] | null {
  if (!s.anyOf) return null;
  const consts = s.anyOf
    .filter((x) => x.const !== undefined)
    .map((x) => x.const);
  return consts.length > 0 && consts.length === s.anyOf.length ? consts : null;
}

const INPUT_CLASS =
  "w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none";

function BoolToggle({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: boolean) => void;
}) {
  const on = !!value;
  return (
    <label className="inline-flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`h-5 w-9 rounded-full transition ${on ? "bg-blue-600" : "bg-zinc-600"}`}
        />
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </div>
      <span className="text-xs text-zinc-400">{on ? "Enabled" : "Disabled"}</span>
    </label>
  );
}

function EnumInput({
  options,
  value,
  onChange,
}: {
  options: unknown[];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <select
      value={value == null ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(undefined);
        const match = options.find((o) => String(o) === raw);
        onChange(match ?? raw);
      }}
      className={INPUT_CLASS}
    >
      <option value="">— select —</option>
      {options.map((opt, i) => (
        <option key={`${String(opt)}-${i}`} value={String(opt)}>
          {String(opt)}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      value={value != null ? String(value) : ""}
      min={schema.minimum}
      max={schema.maximum}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : Number(e.target.value))
      }
      className={INPUT_CLASS}
    />
  );
}

function StringInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <input
      type="text"
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      className={INPUT_CLASS}
    />
  );
}

function JsonFallback({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [text, setText] = useState(
    value != null ? JSON.stringify(value, null, 2) : "",
  );
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() === "") {
            setErr(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(text));
            setErr(null);
          } catch (e: any) {
            setErr(e.message);
          }
        }}
        className={`${INPUT_CLASS} font-mono text-xs resize-y`}
        spellCheck={false}
      />
      {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
    </div>
  );
}

function ArrayEditor({
  itemSchema,
  value,
  onChange,
}: {
  itemSchema: JsonSchema | undefined;
  value: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs italic text-zinc-500">(empty)</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-1.5 w-6 shrink-0 text-xs text-zinc-500">
            {i}.
          </span>
          <div className="flex-1">
            <SchemaField
              schema={itemSchema ?? { type: "string" }}
              value={item}
              onChange={(v) => {
                const next = items.slice();
                next[i] = v;
                onChange(next);
              }}
              hideLabel
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="mt-1 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-red-900/40 hover:text-red-300"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, defaultForSchema(itemSchema)])}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
      >
        + Add item
      </button>
    </div>
  );
}

function MapEditor({
  valueSchema,
  value,
  onChange,
}: {
  valueSchema: JsonSchema | undefined;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(value ?? {});
  const [newKey, setNewKey] = useState("");
  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs italic text-zinc-500">(empty)</p>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start gap-2">
          <code className="mt-1.5 shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs text-sky-300">
            {k}
          </code>
          <div className="flex-1">
            <SchemaField
              schema={valueSchema ?? { type: "string" }}
              value={v}
              onChange={(nv) => onChange({ ...value, [k]: nv })}
              hideLabel
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
            className="mt-1 rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-red-900/40 hover:text-red-300"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="new key…"
          className={`${INPUT_CLASS} flex-1`}
        />
        <button
          type="button"
          disabled={!newKey.trim() || newKey in (value ?? {})}
          onClick={() => {
            onChange({ ...value, [newKey]: defaultForSchema(valueSchema) });
            setNewKey("");
          }}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function defaultForSchema(s: JsonSchema | undefined): unknown {
  if (!s) return "";
  if (s.default !== undefined) return s.default;
  const t = effectiveType(s);
  if (t === "object") return {};
  if (t === "array") return [];
  if (t === "boolean") return false;
  if (t === "number" || t === "integer") return 0;
  return "";
}

function SchemaField({
  schema,
  value,
  onChange,
  name,
  description,
  hideLabel,
  depth = 0,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  name?: string;
  description?: string;
  hideLabel?: boolean;
  depth?: number;
}): React.ReactElement {
  const label = name ? formatLabel(name) : "";
  const desc = description ?? schema.description;

  const enumVals = schema.enum ?? constEnumFromAnyOf(schema);
  let body: React.ReactNode;

  if (enumVals && enumVals.length > 0) {
    body = <EnumInput options={enumVals} value={value} onChange={onChange} />;
  } else {
    const type = effectiveType(schema);
    if (type === "boolean") {
      body = <BoolToggle value={value} onChange={onChange} />;
    } else if (type === "number" || type === "integer") {
      body = <NumberInput schema={schema} value={value} onChange={onChange} />;
    } else if (type === "string") {
      body = <StringInput value={value} onChange={onChange} />;
    } else if (type === "array") {
      const itemSchema = Array.isArray(schema.items)
        ? schema.items[0]
        : schema.items;
      body = (
        <ArrayEditor
          itemSchema={itemSchema}
          value={Array.isArray(value) ? (value as unknown[]) : []}
          onChange={onChange}
        />
      );
    } else if (type === "object") {
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        return (
          <ObjectSection
            properties={schema.properties}
            required={schema.required ?? []}
            additionalProperties={schema.additionalProperties}
            value={
              value && typeof value === "object" && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {}
            }
            onChange={onChange}
            name={name}
            description={desc}
            depth={depth}
          />
        );
      }
      if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        body = (
          <MapEditor
            valueSchema={schema.additionalProperties}
            value={(value as Record<string, unknown>) ?? {}}
            onChange={onChange}
          />
        );
      } else {
        body = <JsonFallback value={value} onChange={onChange} />;
      }
    } else {
      body = <JsonFallback value={value} onChange={onChange} />;
    }
  }

  return (
    <div className="space-y-1">
      {!hideLabel && label && (
        <label className="block text-xs font-medium text-zinc-300">
          {label}
        </label>
      )}
      {!hideLabel && desc && (
        <p className="text-[11px] text-zinc-500">{desc}</p>
      )}
      {body}
    </div>
  );
}

function ObjectSection({
  properties,
  required,
  additionalProperties,
  value,
  onChange,
  name,
  description,
  depth,
}: {
  properties: Record<string, JsonSchema>;
  required: string[];
  additionalProperties: boolean | JsonSchema | undefined;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  name?: string;
  description?: string;
  depth: number;
}) {
  const label = name ? formatLabel(name) : "Configuration";
  const count = Object.keys(properties).length;

  const body = (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(properties).map(([k, s]) => {
        const isReq = required.includes(k);
        return (
          <div
            key={k}
            className={
              effectiveType(s) === "object" && s.properties
                ? "sm:col-span-2"
                : ""
            }
          >
            <SchemaField
              schema={s}
              value={value?.[k]}
              onChange={(v) => {
                const next = { ...value };
                if (v === undefined) delete next[k];
                else next[k] = v;
                onChange(next);
              }}
              name={isReq ? `${k} *` : k}
              depth={depth + 1}
            />
          </div>
        );
      })}
      {additionalProperties && typeof additionalProperties === "object" && (
        <div className="sm:col-span-2 border-t border-zinc-800 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Additional properties
          </p>
          <MapEditor
            valueSchema={additionalProperties}
            value={Object.fromEntries(
              Object.entries(value ?? {}).filter(([k]) => !(k in properties)),
            )}
            onChange={(extra) => {
              const base: Record<string, unknown> = {};
              for (const k of Object.keys(properties)) {
                if (k in (value ?? {})) base[k] = value[k];
              }
              onChange({ ...base, ...extra });
            }}
          />
        </div>
      )}
    </div>
  );

  if (depth === 0) {
    return (
      <div className="space-y-4">
        {description && (
          <p className="text-xs text-zinc-500">{description}</p>
        )}
        {body}
      </div>
    );
  }

  return (
    <details
      open={depth < 1}
      className="rounded-lg border border-zinc-700 bg-zinc-900/40"
    >
      <summary className="cursor-pointer list-none select-none rounded-t-lg bg-zinc-800/60 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">
        <span className="mr-2 text-zinc-500">▸</span>
        {label}
        <span className="ml-2 text-xs font-normal text-zinc-500">
          ({count} field{count === 1 ? "" : "s"})
        </span>
        {description && (
          <p className="mt-1 text-[11px] font-normal text-zinc-500">
            {description}
          </p>
        )}
      </summary>
      <div className="px-4 py-3">{body}</div>
    </details>
  );
}

export function ConfigEditor({
  schema,
  values: initialValues,
}: {
  schema: JsonSchema;
  values: Record<string, unknown>;
}) {
  const [mode, setMode] = useState<ViewMode>("form");
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [dirty, setDirty] = useState(false);
  const [rawText, setRawText] = useState(JSON.stringify(initialValues, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawEditing, setRawEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [filter, setFilter] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const rootSchema: JsonSchema = useMemo(() => {
    if (!schema) return { type: "object", properties: {} };
    if (schema.properties || schema.type) return schema;
    return { type: "object", properties: {} };
  }, [schema]);

  const filteredSchema = useMemo<JsonSchema>(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !rootSchema.properties) return rootSchema;
    const walk = (s: JsonSchema, keyPath: string): JsonSchema | null => {
      if (keyPath.toLowerCase().includes(q)) return s;
      if (
        s.description &&
        s.description.toLowerCase().includes(q)
      )
        return s;
      if (s.properties) {
        const next: Record<string, JsonSchema> = {};
        for (const [k, v] of Object.entries(s.properties)) {
          const keep = walk(v, `${keyPath}.${k}`);
          if (keep) next[k] = keep;
        }
        if (Object.keys(next).length > 0) return { ...s, properties: next };
      }
      return null;
    };
    const filtered: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(rootSchema.properties)) {
      const keep = walk(v, k);
      if (keep) filtered[k] = keep;
    }
    return { ...rootSchema, properties: filtered };
  }, [rootSchema, filter]);

  const handleRootChange = useCallback((next: Record<string, unknown>) => {
    setValues(next);
    setRawText(JSON.stringify(next, null, 2));
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

  const hasProperties =
    rootSchema.properties && Object.keys(rootSchema.properties).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
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
        {mode === "form" && hasProperties && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter fields…"
            className={`${INPUT_CLASS} max-w-xs`}
          />
        )}
      </div>

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

      {mode === "form" ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
          {!hasProperties ? (
            <p className="text-sm text-zinc-400">
              No configuration schema available.
            </p>
          ) : (
            <ObjectSection
              properties={filteredSchema.properties ?? {}}
              required={filteredSchema.required ?? []}
              additionalProperties={filteredSchema.additionalProperties}
              value={values}
              onChange={handleRootChange}
              depth={0}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {rawEditing ? "Editing — click Done to parse" : "Read-only view"}
            </span>
            <button
              onClick={() => {
                if (rawEditing) {
                  handleRawBlur();
                  if (!rawError) setRawEditing(false);
                } else {
                  setRawText(JSON.stringify(values, null, 2));
                  setRawEditing(true);
                }
              }}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              {rawEditing ? "Done" : "Edit"}
            </button>
          </div>
          {rawEditing ? (
            <textarea
              rows={20}
              value={rawText}
              onChange={(e) => handleRawChange(e.target.value)}
              onBlur={handleRawBlur}
              className="w-full rounded border border-zinc-600 bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none resize-y"
              spellCheck={false}
              autoFocus
            />
          ) : (
            <pre
              className="max-h-[32rem] overflow-auto rounded border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-300"
              dangerouslySetInnerHTML={{
                __html: highlightJson(JSON.stringify(values, null, 2)),
              }}
            />
          )}
          {rawError && <p className="text-xs text-red-400">{rawError}</p>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || !!rawError}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {saving && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
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
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
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
