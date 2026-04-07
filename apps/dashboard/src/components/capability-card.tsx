"use client";
import { useState, useRef, useEffect } from "react";
import type { Capability, SetupField } from "@/lib/capabilities-data";

// ── Toggle Switch ────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-pill border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        checked ? "bg-primary" : "bg-dark-border"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Eye Icon ─────────────────────────────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Field Renderer ────────────────────────────────────────────────────────────
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SetupField;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const [showPw, setShowPw] = useState(false);

  const inputClass =
    "block w-full rounded border border-dark-border bg-dark px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition focus:border-primary";

  if (field.type === "toggle") {
    return (
      <div className="flex items-center gap-3">
        <ToggleSwitch checked={Boolean(value)} onChange={onChange} />
        <span className="text-sm text-text-gray">{value ? "Enabled" : "Disabled"}</span>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass + " cursor-pointer"}
        style={{ colorScheme: "dark" }}
      >
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "password") {
    return (
      <div className="relative">
        <input
          type={showPw ? "text" : "password"}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass + " pr-10"}
        />
        <button
          type="button"
          onClick={() => setShowPw((p) => !p)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-gray transition"
          tabIndex={-1}
        >
          <EyeIcon open={showPw} />
        </button>
      </div>
    );
  }

  return (
    <input
      type="text"
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={inputClass}
    />
  );
}

// ── Capability Card ───────────────────────────────────────────────────────────
export function CapabilityCard({ capability }: { capability: Capability }) {
  const [expanded, setExpanded] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    capability.setupFields.forEach((f) => {
      init[f.key] = f.type === "toggle" ? false : f.options?.[0]?.value ?? "";
    });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss success
  useEffect(() => {
    if (result?.ok) {
      const t = setTimeout(() => setResult(null), 4000);
      return () => clearTimeout(t);
    }
  }, [result]);

  const hasFields = capability.setupFields.length > 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: capability.gatewayMethod || "config.apply",
          params: { capabilityId: capability.id, ...formValues },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: data.message || "Saved successfully." });
        setExpanded(false);
      } else {
        setResult({ ok: false, message: data.error || "Something went wrong." });
      }
    } catch {
      setResult({ ok: false, message: "Could not reach the bridge." });
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = () => {
    if (!hasFields) return;
    setExpanded((v) => !v);
    setResult(null);
  };

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded border border-dark-border bg-dark-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-dark"
      style={{ borderLeftWidth: "3px", borderLeftColor: capability.color }}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-4 p-5">
        {/* Icon box */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-xl"
          style={{ backgroundColor: capability.color + "1a" }}
        >
          {capability.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-text-primary leading-tight">{capability.name}</h3>
          </div>
          <p className="mt-1 text-sm text-text-gray line-clamp-2 leading-relaxed">{capability.description}</p>

          {/* Tags */}
          {capability.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {capability.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-pill bg-dark-lighter px-2 py-0.5 text-xs text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action */}
        <div className="shrink-0 ml-2">
          {hasFields ? (
            <button
              type="button"
              onClick={toggleExpand}
              className="inline-flex items-center gap-1.5 rounded bg-primary py-2 px-4 text-sm font-medium text-white transition hover:bg-primary-hover active:scale-95"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {expanded ? "Close" : "Configure"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded bg-primary py-2 px-4 text-sm font-medium text-white transition hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Spinner /> : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              Install
            </button>
          )}
        </div>
      </div>

      {/* ── Success / Error inline banner ── */}
      {result && (
        <div
          className={`mx-5 mb-3 flex items-center gap-2 rounded px-3 py-2 text-sm transition-all ${
            result.ok
              ? "bg-success/10 text-success border border-success/20"
              : "bg-danger/10 text-danger border border-danger/20"
          }`}
        >
          {result.ok ? (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {result.message}
        </div>
      )}

      {/* ── Expandable Form ── */}
      <div
        ref={formRef}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <form onSubmit={handleSave} className="border-t border-dark-border px-5 pb-5 pt-4">
          <div className="space-y-4">
            {capability.setupFields.map((field) => (
              <div key={field.key}>
                <div className="mb-1.5 flex items-center gap-2">
                  <label className="text-sm text-text-gray">{field.label}</label>
                  {field.required && <span className="text-xs text-danger">*</span>}
                  {field.envHint && (
                    <span className="ml-auto rounded-pill bg-dark-lighter px-2 py-0.5 font-mono text-xs text-text-muted">
                      {field.envHint}
                    </span>
                  )}
                </div>
                <FieldInput
                  field={field}
                  value={formValues[field.key] ?? (field.type === "toggle" ? false : "")}
                  onChange={(v) => setFormValues((prev) => ({ ...prev, [field.key]: v }))}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded bg-primary py-2.5 px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Spinner />}
              Save & Enable
            </button>
            <button
              type="button"
              onClick={() => { setExpanded(false); setResult(null); }}
              className="text-sm text-text-muted transition hover:text-text-gray"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
