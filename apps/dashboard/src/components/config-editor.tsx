"use client";

import {
  useState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  createContext,
  Component,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { MonacoMarker } from "./monaco-json-editor";
import {
  getFieldCopy,
  getSectionCopy,
  type ConfigFieldCopy,
  type ConfigSectionCopy,
} from "@/lib/config-copy";

/**
 * Context carrying the inspector callback down the form tree so we don't have
 * to prop-drill through Array/Map/Object editors. A path of `null` means no
 * inspector is available (e.g. during tests or if the caller omitted it).
 */
const InspectorContext = createContext<((path: string) => void) | null>(null);

type ViewMode = "form" | "raw";

// Lazy-loaded, client-only Monaco editor. Keeping this at module scope
// (not inside the component body) ensures the dynamic import is created
// once — and, crucially, that the Monaco chunk is never evaluated during
// SSR nor pulled into bundles of unrelated routes.
const MonacoJsonEditor = dynamic(() => import("./monaco-json-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[32rem] items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-xs text-zinc-500">
      Loading editor…
    </div>
  ),
});

// Error boundary for Monaco: if the chunk fails to load (network / parse
// error), we render a plain textarea fallback rather than white-screening.
class MonacoErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // swallow — fallback renders
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

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
  pattern?: string;
};

function formatLabel(key: string): string {
  // Strip trailing " *" required marker if present so lookups still work.
  const bareKey = key.replace(/\s*\*$/, "");
  return bareKey
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function joinPath(parent: string | undefined, key: string): string {
  if (!key) return parent ?? "";
  if (!parent) return key;
  return `${parent}.${key}`;
}

/**
 * Pretty label for a field, honoring copy overrides first.
 * `key` may include a trailing "*" required marker — strip before lookup.
 */
function resolveFieldLabel(path: string, key: string): string {
  const bareKey = key.replace(/\s*\*$/, "");
  const required = key !== bareKey;
  const override = getFieldCopy(path)?.label;
  const base = override ?? formatLabel(bareKey);
  return required ? `${base} *` : base;
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
  path,
}: {
  itemSchema: JsonSchema | undefined;
  value: unknown[];
  onChange: (v: unknown[]) => void;
  path: string;
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
              path={`${path}[${i}]`}
              /* array rows don't get their own info button — parent field's button is enough */
              suppressInspector
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
  path,
}: {
  valueSchema: JsonSchema | undefined;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  path: string;
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
              path={joinPath(path, k)}
              /* map entries don't get their own info button — parent field's button is enough */
              suppressInspector
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
  path = "",
  suppressInspector = false,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  name?: string;
  description?: string;
  hideLabel?: boolean;
  depth?: number;
  path?: string;
  suppressInspector?: boolean;
}): React.ReactElement {
  const inspect = useContext(InspectorContext);
  const label = name ? resolveFieldLabel(path, name) : "";
  const fieldCopy = path ? getFieldCopy(path) : undefined;
  const desc = description ?? fieldCopy?.description ?? schema.description;

  const enumVals = schema.enum ?? constEnumFromAnyOf(schema);
  let body: React.ReactNode;
  const type = effectiveType(schema);

  if (enumVals && enumVals.length > 0) {
    body = <EnumInput options={enumVals} value={value} onChange={onChange} />;
  } else {
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
          path={path}
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
            path={path}
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
            path={path}
          />
        );
      } else {
        body = <JsonFallback value={value} onChange={onChange} />;
      }
    } else {
      body = <JsonFallback value={value} onChange={onChange} />;
    }
  }

  // Info button: show for regular fields with a known path, unless we're in
  // an array row / map entry (suppressInspector). Nested object headers get
  // their own info affordance inside ObjectSection.
  const showInfoButton =
    !hideLabel && !suppressInspector && !!path && !!inspect && type !== "object";

  return (
    <div className="space-y-1">
      {!hideLabel && label && (
        <div className="flex items-center gap-1.5">
          <label className="block text-xs font-medium text-zinc-300">
            {label}
          </label>
          {showInfoButton && (
            <button
              type="button"
              onClick={() => inspect!(path)}
              aria-label={`Show details for ${label}`}
              title="Show field details"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 text-[10px] leading-none text-zinc-400 transition hover:border-blue-500 hover:bg-blue-500/10 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-zinc-900"
            >
              i
            </button>
          )}
        </div>
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
  path = "",
}: {
  properties: Record<string, JsonSchema>;
  required: string[];
  additionalProperties: boolean | JsonSchema | undefined;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  name?: string;
  description?: string;
  depth: number;
  path?: string;
}) {
  const count = Object.keys(properties).length;

  const body = (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(properties).map(([k, s]) => {
        const isReq = required.includes(k);
        const childPath = joinPath(path, k);
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
              path={childPath}
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
            path={path}
          />
        </div>
      )}
    </div>
  );

  // Depth 0 is the form root — an object containing the top-level sections.
  // We render nothing here (no outer heading) and let each top-level child
  // render its own header card via depth === 1 below.
  if (depth === 0) {
    return <div className="space-y-4">{body}</div>;
  }

  // Depth 1: these are the top-level config sections (meta, env, logging, …).
  // Render each as a full header card with summary/whatItControls/notes.
  if (depth === 1) {
    const sectionKey = name?.replace(/\s*\*$/, "") ?? "";
    const sectionCopy: ConfigSectionCopy | undefined =
      getSectionCopy(sectionKey);
    const title = sectionCopy?.title ?? formatLabel(name ?? "Configuration");

    return (
      <details
        open
        className="rounded-lg border border-zinc-700 bg-zinc-900/40"
      >
        <summary className="cursor-pointer list-none select-none rounded-t-lg bg-zinc-800/60 px-4 py-3 hover:bg-zinc-800">
          <div className="flex items-baseline gap-2">
            <span className="text-zinc-500">▾</span>
            <span className="text-base font-semibold text-zinc-100">
              {title}
            </span>
            <span className="text-xs font-normal text-zinc-500">
              ({count} field{count === 1 ? "" : "s"})
            </span>
          </div>
          {sectionCopy?.summary && (
            <p className="mt-1 pl-6 text-sm text-zinc-400">
              {sectionCopy.summary}
            </p>
          )}
        </summary>
        <div className="space-y-3 px-4 py-3">
          {sectionCopy?.whatItControls && (
            <p className="text-xs leading-relaxed text-zinc-500">
              {sectionCopy.whatItControls}
            </p>
          )}
          {sectionCopy?.notes && sectionCopy.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-400/90">
              {sectionCopy.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          {(sectionCopy?.whatItControls || sectionCopy?.notes?.length) && (
            <div className="border-t border-zinc-800 pt-3" />
          )}
          {description && (
            <p className="text-[11px] text-zinc-500">{description}</p>
          )}
          {body}
        </div>
      </details>
    );
  }

  // Deeper nested objects — keep the existing compact collapsible rendering.
  const nestedLabel = name
    ? resolveFieldLabel(path, name)
    : "Configuration";
  return (
    <details
      open
      className="rounded-lg border border-zinc-700 bg-zinc-900/40"
    >
      <summary className="cursor-pointer list-none select-none rounded-t-lg bg-zinc-800/60 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">
        <span className="mr-2 text-zinc-500">▸</span>
        {nestedLabel}
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

/**
 * Human-readable type summary for the inspector. Handles anyOf/enum and
 * const-union cases so operators see "one of: silent, fatal, ..." instead
 * of a bare "string".
 */
function describeType(schema: JsonSchema | undefined): string {
  if (!schema) return "unknown";
  if (schema.enum && schema.enum.length > 0) {
    return `one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`;
  }
  const constUnion = constEnumFromAnyOf(schema);
  if (constUnion) {
    return `one of: ${constUnion.map((v) => JSON.stringify(v)).join(", ")}`;
  }
  if (schema.type) {
    return Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type;
  }
  if (schema.anyOf) {
    const types = schema.anyOf
      .map((s) => (Array.isArray(s.type) ? s.type.join(" | ") : s.type))
      .filter(Boolean);
    if (types.length > 0) return `any of: ${types.join(", ")}`;
  }
  return "unknown";
}

function FieldInspectorPanel({
  path,
  schema,
  required,
  onClose,
}: {
  path: string;
  schema: JsonSchema | undefined;
  required: boolean;
  onClose: () => void;
}) {
  const parts = path.split(".").filter(Boolean);
  const key = parts[parts.length - 1] ?? path;
  const copy: ConfigFieldCopy | undefined = getFieldCopy(path);
  const label = copy?.label ?? formatLabel(key);
  const typeText = describeType(schema);
  const constraints: string[] = [];
  if (schema?.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema?.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema?.exclusiveMinimum !== undefined)
    constraints.push(`> ${schema.exclusiveMinimum}`);
  if (schema?.exclusiveMaximum !== undefined)
    constraints.push(`< ${schema.exclusiveMaximum}`);
  if (schema?.pattern) constraints.push(`pattern: ${schema.pattern}`);

  return (
    <aside
      aria-label={`Details for ${label}`}
      className="sticky top-4 h-fit rounded-lg border border-zinc-700 bg-zinc-900/80 shadow-lg"
    >
      <header className="flex items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-100">
            {label}
          </h3>
          <code className="block truncate text-[11px] text-sky-300">
            {path}
          </code>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ×
        </button>
      </header>
      <dl className="space-y-3 px-4 py-3 text-xs text-zinc-300">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Description
          </dt>
          <dd className="mt-1 leading-relaxed text-zinc-300">
            {copy?.description ?? (
              <span className="italic text-zinc-500">No description yet.</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Type
          </dt>
          <dd className="mt-1 font-mono text-zinc-300">{typeText}</dd>
        </div>
        {constraints.length > 0 && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Constraints
            </dt>
            <dd className="mt-1 font-mono text-zinc-300">
              {constraints.join(" · ")}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Required
          </dt>
          <dd className="mt-1 text-zinc-300">{required ? "Yes" : "No"}</dd>
        </div>
        {copy?.example && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Example
            </dt>
            <dd className="mt-1">
              <code className="block whitespace-pre-wrap break-all rounded bg-zinc-800/80 px-2 py-1 font-mono text-[11px] text-emerald-300">
                {copy.example}
              </code>
            </dd>
          </div>
        )}
        {copy?.subsystem && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Subsystem
            </dt>
            <dd className="mt-1 text-zinc-400">{copy.subsystem}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

export function ConfigEditor({
  schema,
  values: initialValues,
  initialBaseHash,
}: {
  schema: JsonSchema;
  values: Record<string, unknown>;
  initialBaseHash: string;
}) {
  const [mode, setMode] = useState<ViewMode>("form");
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [dirty, setDirty] = useState(false);
  const [rawText, setRawText] = useState(JSON.stringify(initialValues, null, 2));
  const [rawParseError, setRawParseError] = useState<string | null>(null);
  const [rawMarkers, setRawMarkers] = useState<MonacoMarker[]>([]);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [filter, setFilter] = useState("");
  const [baseHash, setBaseHash] = useState(initialBaseHash);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [inspectedPath, setInspectedPath] = useState<string | null>(null);
  // On hash-conflict, we stash the user's in-flight draft before refetching
  // the server's copy so they can explicitly restore it if desired.
  const [discardedDraft, setDiscardedDraft] = useState<
    Record<string, unknown> | null
  >(null);

  // Refetch the config snapshot to pick up the latest hash (and optionally
  // latest values, used when a concurrent write conflict is detected).
  async function refetchSnapshot(opts?: { overwriteValues?: boolean }): Promise<void> {
    try {
      const res = await fetch("/api/gateway-config", { cache: "no-store" });
      if (!res.ok) return;
      const snap = (await res.json()) as {
        hash?: string;
        parsed?: Record<string, unknown>;
        config?: Record<string, unknown>;
        runtimeConfig?: Record<string, unknown>;
      };
      if (typeof snap.hash === "string") setBaseHash(snap.hash);
      if (opts?.overwriteValues) {
        const next =
          snap.parsed ?? snap.config ?? snap.runtimeConfig ?? {};
        setValues(next);
        setRawText(JSON.stringify(next, null, 2));
        setDirty(false);
        setRawParseError(null);
      }
    } catch {
      // best-effort; callers have already reported primary outcome
    }
  }

  function isHashConflictError(msg: string | undefined | null): boolean {
    if (!msg) return false;
    const m = msg.toLowerCase();
    return (
      m.includes("config changed since last load") ||
      m.includes("config base hash required")
    );
  }

  const rootSchema: JsonSchema = useMemo(() => {
    if (!schema) return { type: "object", properties: {} };
    if (schema.properties || schema.type) return schema;
    return { type: "object", properties: {} };
  }, [schema]);

  const filteredSchema = useMemo<JsonSchema>(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !rootSchema.properties) return rootSchema;
    const matchesCopy = (keyPath: string, topLevel: string): boolean => {
      const field = getFieldCopy(keyPath);
      if (field?.description && field.description.toLowerCase().includes(q))
        return true;
      if (field?.label && field.label.toLowerCase().includes(q)) return true;
      const section = getSectionCopy(topLevel);
      if (section) {
        if (section.title.toLowerCase().includes(q)) return true;
        if (section.summary.toLowerCase().includes(q)) return true;
        if (
          section.whatItControls &&
          section.whatItControls.toLowerCase().includes(q)
        )
          return true;
      }
      return false;
    };
    const walk = (
      s: JsonSchema,
      keyPath: string,
      topLevel: string,
    ): JsonSchema | null => {
      if (keyPath.toLowerCase().includes(q)) return s;
      if (s.description && s.description.toLowerCase().includes(q)) return s;
      if (matchesCopy(keyPath, topLevel)) return s;
      if (s.properties) {
        const next: Record<string, JsonSchema> = {};
        for (const [k, v] of Object.entries(s.properties)) {
          const keep = walk(v, `${keyPath}.${k}`, topLevel);
          if (keep) next[k] = keep;
        }
        if (Object.keys(next).length > 0) return { ...s, properties: next };
      }
      return null;
    };
    const filtered: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(rootSchema.properties)) {
      const keep = walk(v, k, k);
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

  // Raw JSON text → parsed value mirror. Tracks whether current editor
  // content parses (sets rawParseError) and, when it parses, keeps `values`
  // in sync so form-mode switches pick up the edit.
  function handleRawChange(text: string) {
    setRawText(text);
    setFeedback(null);
    if (text.trim() === "") {
      setRawParseError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setRawParseError(null);
      const prev = JSON.stringify(values);
      const nextStr = JSON.stringify(parsed);
      if (prev !== nextStr) {
        setValues(parsed as Record<string, unknown>);
        setDirty(true);
      }
    } catch (e: any) {
      setRawParseError(e?.message ?? "Invalid JSON");
    }
  }

  function switchMode(next: ViewMode) {
    if (next === mode) return;
    if (mode === "raw" && next === "form") {
      // Leaving raw → try to commit edits. If invalid, warn and stay.
      if (rawText.trim() === "") {
        setValues({});
      } else {
        try {
          const parsed = JSON.parse(rawText);
          setValues(parsed as Record<string, unknown>);
          setRawParseError(null);
        } catch (e: any) {
          setFeedback({
            type: "error",
            msg:
              "Raw JSON has parse errors — fix them or reset before switching to Form view. " +
              (e?.message ?? ""),
          });
          return;
        }
      }
    }
    if (next === "raw") {
      setRawText(JSON.stringify(values, null, 2));
      setRawParseError(null);
    }
    setMode(next);
  }

  function handleRawReset() {
    setRawText(JSON.stringify(values, null, 2));
    setRawParseError(null);
  }

  // Re-sync the rawText buffer if upstream values change (e.g. after Save
  // clears dirty). Only while mode === "raw" and buffer already parses to
  // the same object, to avoid clobbering in-flight edits.
  useEffect(() => {
    if (mode !== "raw") return;
    if (dirty) return;
    setRawText(JSON.stringify(values, null, 2));
    setRawParseError(null);
  }, [values, mode, dirty]);

  // Escape closes the inspector panel.
  useEffect(() => {
    if (inspectedPath === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInspectedPath(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inspectedPath]);

  const openInspector = useCallback((path: string) => {
    setInspectedPath(path);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectedPath(null);
  }, []);

  // Look up a schema node for a dotted path from the root schema. Only
  // traverses `properties`; returns undefined if the path goes through an
  // array/map segment we don't represent in the dotted form.
  const inspectedSchema: JsonSchema | undefined = useMemo(() => {
    if (!inspectedPath) return undefined;
    const parts = inspectedPath.split(".").filter(Boolean);
    let node: JsonSchema | undefined = rootSchema;
    for (const p of parts) {
      if (!node?.properties) return undefined;
      node = node.properties[p];
      if (!node) return undefined;
    }
    return node;
  }, [inspectedPath, rootSchema]);

  // Determine whether the inspected field is required by its parent.
  const inspectedIsRequired: boolean = useMemo(() => {
    if (!inspectedPath) return false;
    const parts = inspectedPath.split(".").filter(Boolean);
    if (parts.length === 0) return false;
    const leaf = parts[parts.length - 1];
    let node: JsonSchema | undefined = rootSchema;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node?.properties) return false;
      node = node.properties[parts[i]];
      if (!node) return false;
    }
    return (node?.required ?? []).includes(leaf);
  }, [inspectedPath, rootSchema]);

  async function handleSave() {
    if (rawParseError) return;
    if (!baseHash) {
      setFeedback({
        type: "error",
        msg: "Missing base hash — reload the page to fetch a fresh config snapshot.",
      });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gateway-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: values, baseHash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg: string = data.error || "Save failed";
        if (isHashConflictError(errMsg)) {
          // Stash the user's in-flight edits BEFORE refetching so they can
          // restore them if the overwrite wasn't what they wanted.
          setDiscardedDraft(values);
          await refetchSnapshot({ overwriteValues: true });
          setFeedback({
            type: "error",
            msg: "Configuration changed in another session. Reload to see latest.",
          });
          return;
        }
        throw new Error(errMsg);
      }
      setDirty(false);
      setDiscardedDraft(null);
      setFeedback({ type: "success", msg: "Configuration saved." });
      // Pick up new hash for the next write; do not clobber the freshly-saved values.
      await refetchSnapshot({ overwriteValues: false });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleApply() {
    if (rawParseError) return;
    if (!baseHash) {
      setFeedback({
        type: "error",
        msg: "Missing base hash — reload the page to fetch a fresh config snapshot.",
      });
      return;
    }
    setApplying(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gateway-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", config: values, baseHash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg: string = data.error || "Apply failed";
        if (isHashConflictError(errMsg)) {
          // Stash the user's in-flight edits BEFORE refetching so they can
          // restore them if the overwrite wasn't what they wanted.
          setDiscardedDraft(values);
          await refetchSnapshot({ overwriteValues: true });
          setFeedback({
            type: "error",
            msg: "Configuration changed in another session. Reload to see latest.",
          });
          return;
        }
        throw new Error(errMsg);
      }
      setDiscardedDraft(null);
      setFeedback({ type: "success", msg: "Configuration applied successfully." });
      await refetchSnapshot({ overwriteValues: false });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setApplying(false);
    }
  }

  function handleRestoreDiscardedDraft() {
    if (!discardedDraft) return;
    setValues(discardedDraft);
    setRawText(JSON.stringify(discardedDraft, null, 2));
    setRawParseError(null);
    setDirty(true);
    setDiscardedDraft(null);
    setFeedback({
      type: "error",
      msg: "Your edits were restored. Re-save to try again — you may conflict again if the server has changed further.",
    });
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
          <div>{feedback.msg}</div>
          {discardedDraft && feedback.type === "error" && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-red-200/90">
                Your unsaved edits were discarded.
              </p>
              <button
                type="button"
                onClick={handleRestoreDiscardedDraft}
                className="rounded border border-red-500/60 bg-red-900/40 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-800/60 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Restore my edits
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-3 opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {mode === "form" ? (
        <div
          className={`grid gap-4 ${
            inspectedPath ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""
          }`}
        >
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
            {!hasProperties ? (
              <p className="text-sm text-zinc-400">
                No configuration schema available.
              </p>
            ) : (
              <InspectorContext.Provider value={openInspector}>
                <ObjectSection
                  properties={filteredSchema.properties ?? {}}
                  required={filteredSchema.required ?? []}
                  additionalProperties={filteredSchema.additionalProperties}
                  value={values}
                  onChange={handleRootChange}
                  depth={0}
                />
              </InspectorContext.Provider>
            )}
          </div>
          {inspectedPath && (
            <FieldInspectorPanel
              path={inspectedPath}
              schema={inspectedSchema}
              required={inspectedIsRequired}
              onClose={closeInspector}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-400">
              Edit the full config as JSON. Validated live against the gateway schema.
            </p>
            <button
              onClick={handleRawReset}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
              title="Revert raw JSON to last-saved values"
            >
              Reset
            </button>
          </div>
          {(() => {
            const hasParseError = !!rawParseError;
            const markerErrorCount = hasParseError
              ? 0
              : rawMarkers.filter((m) => m.severity === "error").length;
            const errorCount = (hasParseError ? 1 : 0) + markerErrorCount;
            const warningCount = rawMarkers.filter(
              (m) => m.severity === "warning",
            ).length;
            if (errorCount === 0 && warningCount === 0) return null;
            return (
              <div
                className={`rounded border px-3 py-2 text-xs ${
                  errorCount > 0
                    ? "border-red-700 bg-red-900/30 text-red-300"
                    : "border-amber-700 bg-amber-900/30 text-amber-300"
                }`}
              >
                {errorCount > 0 && (
                  <span>
                    {errorCount} parse/schema error{errorCount === 1 ? "" : "s"}
                  </span>
                )}
                {errorCount > 0 && warningCount > 0 && <span> · </span>}
                {warningCount > 0 && (
                  <span>
                    {warningCount} schema warning{warningCount === 1 ? "" : "s"}
                  </span>
                )}
                {rawParseError && (
                  <div className="mt-1 font-mono text-[11px] opacity-90">
                    {rawParseError}
                  </div>
                )}
              </div>
            );
          })()}
          <MonacoErrorBoundary
            fallback={
              <div className="space-y-1">
                <p className="text-xs text-amber-400">
                  Editor failed to load; using fallback.
                </p>
                <textarea
                  rows={20}
                  value={rawText}
                  onChange={(e) => handleRawChange(e.target.value)}
                  className="w-full rounded border border-zinc-600 bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none resize-y"
                  spellCheck={false}
                />
              </div>
            }
          >
            <MonacoJsonEditor
              value={rawText}
              schema={rootSchema as Record<string, unknown>}
              onChange={handleRawChange}
              onMarkersChange={setRawMarkers}
              height="32rem"
            />
          </MonacoErrorBoundary>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || !!rawParseError}
          title="Writes openclaw.json. Does not change the running gateway."
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
          disabled={applying || !!rawParseError}
          title="Activates the current config. The gateway hot-reloads changes where safe and restarts where required."
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
      <p className="text-[11px] leading-relaxed text-zinc-500">
        <span className="text-zinc-400">Save</span> writes openclaw.json; it does not change
        the running gateway. <span className="text-zinc-400">Apply</span> activates the
        current config — the gateway hot-reloads changes where safe and restarts where required.
      </p>
    </div>
  );
}
