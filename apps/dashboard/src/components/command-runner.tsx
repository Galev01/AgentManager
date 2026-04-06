"use client";
import { useState } from "react";
import { COMMANDS, COMMAND_CATEGORIES, type CommandDef } from "@/lib/commands-reference";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: CommandDef["params"][number];
  value: string;
  onChange: (v: string) => void;
}) {
  const isMultiline = param.type === "object" || param.name === "patch" || param.name === "content";
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-xs font-medium text-text-gray">
        <span className="font-mono text-primary">{param.name}</span>
        <span className="text-text-muted">:{param.type}</span>
        {param.required && (
          <span className="rounded bg-danger/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
            required
          </span>
        )}
      </label>
      <p className="text-xs text-text-muted">{param.description}</p>
      {isMultiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={param.type === "object" ? '{"key": "value"}' : ""}
          className="w-full rounded border border-dark-border bg-dark px-3 py-2 font-mono text-xs text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${param.name}…`}
          className="w-full rounded border border-dark-border bg-dark px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
        />
      )}
    </div>
  );
}

function CommandCard({ command }: { command: CommandDef }) {
  const [expanded, setExpanded] = useState(false);
  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(command.params.map((p) => [p.name, ""]))
  );
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);

  const handleParamChange = (name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  const buildParams = (): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const param of command.params) {
      const raw = paramValues[param.name];
      if (!raw && !param.required) continue;
      if (param.type === "number") {
        result[param.name] = Number(raw);
      } else if (param.type === "object" || param.type === "any") {
        try {
          result[param.name] = JSON.parse(raw);
        } catch {
          result[param.name] = raw;
        }
      } else {
        result[param.name] = raw;
      }
    }
    return result;
  };

  const handleRun = async () => {
    setLoading(true);
    setResponseError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: command.method, params: buildParams() }),
      });
      const data = await res.json();
      setResponse(data);
      setResponseOpen(true);
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : "Unknown error");
      setResponseOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded bg-dark-card shadow-card-dark overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 p-6">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-primary">{command.method}</p>
          <p className="mt-1 text-sm text-text-gray">{command.description}</p>
          {command.params.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {command.params.map((p) => (
                <span
                  key={p.name}
                  className="rounded border border-dark-border px-2 py-0.5 font-mono text-xs text-text-muted"
                >
                  {p.name}
                  {p.required ? "" : "?"}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 rounded bg-primary py-2 px-4 text-sm font-medium text-white transition hover:bg-primary/80"
        >
          {expanded ? "Collapse" : "Execute"}
        </button>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="border-t border-dark-border px-6 pb-6 pt-4 flex flex-col gap-4">
          {command.params.length > 0 ? (
            command.params.map((param) => (
              <ParamInput
                key={param.name}
                param={param}
                value={paramValues[param.name]}
                onChange={(v) => handleParamChange(param.name, v)}
              />
            ))
          ) : (
            <p className="text-xs text-text-muted italic">No parameters required.</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleRun}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded bg-primary py-2.5 px-5 text-sm font-medium text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Spinner />}
              {loading ? "Running…" : "Run"}
            </button>
            {response !== null && (
              <button
                onClick={() => setResponseOpen((o) => !o)}
                className="text-xs text-text-muted hover:text-text-gray transition"
              >
                {responseOpen ? "Hide" : "Show"} response
              </button>
            )}
          </div>

          {/* Response area */}
          {responseOpen && (response !== null || responseError) && (
            <div className="rounded bg-dark p-4 font-mono text-xs text-text-gray overflow-auto max-h-64 border border-dark-border">
              {responseError ? (
                <span className="text-danger">{responseError}</span>
              ) : (
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(response, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CommandRunner() {
  const [activeCategory, setActiveCategory] = useState<string>(COMMAND_CATEGORIES[0]);

  const filteredCommands = COMMANDS.filter((c) => c.category === activeCategory);

  return (
    <div className="flex gap-6">
      {/* Left sidebar: category pills */}
      <aside className="w-44 shrink-0">
        <div className="flex flex-col gap-1">
          {COMMAND_CATEGORIES.map((cat) => {
            const count = COMMANDS.filter((c) => c.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center justify-between rounded px-4 py-2.5 text-sm font-medium transition text-left ${
                  activeCategory === cat
                    ? "bg-dark-card text-primary"
                    : "text-text-muted hover:bg-dark-card hover:text-text-gray"
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeCategory === cat
                      ? "bg-primary/20 text-primary"
                      : "bg-dark-border text-text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right panel: command cards */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{activeCategory}</h2>
          <span className="text-xs text-text-muted">{filteredCommands.length} commands</span>
        </div>
        {filteredCommands.map((cmd) => (
          <CommandCard key={cmd.method} command={cmd} />
        ))}
      </div>
    </div>
  );
}
