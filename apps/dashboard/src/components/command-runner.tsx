"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  COMMANDS,
  COMMAND_CATEGORIES,
  type CommandDef,
} from "@/lib/commands-reference";
import { PageHeader, Card, Button, Badge, StatusLamp } from "@/components/ui";

type LastRun = { status: "ok" | "err"; ms: number; at: number };

const FILTER_BAR_STYLE: CSSProperties = {
  position: "sticky",
  top: "var(--header-h)",
  background: "var(--bg)",
  zIndex: 5,
  paddingTop: 12,
  paddingBottom: 12,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const CHIP_ROW_STYLE: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 14,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  padding: "14px 16px",
};

const ROW_MAIN_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const ROW_HEAD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 4,
};

const METHOD_STYLE: CSSProperties = {
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 500,
};

const PARAM_CHIPS_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const ROW_ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexShrink: 0,
};

const LAST_RUN_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

function buildParamsFrom(
  command: CommandDef,
  paramValues: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const param of command.params) {
    const raw = paramValues[param.name] ?? "";
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
}

function EmptyMsg() {
  return (
    <Card>
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <div
          style={{
            color: "var(--text)",
            fontWeight: 500,
            fontSize: 14,
            marginBottom: 4,
          }}
        >
          No commands match
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
          Try a different search or clear filters.
        </div>
      </div>
    </Card>
  );
}

function CommandRow({
  command,
  lastRun,
  onOpen,
}: {
  command: CommandDef;
  lastRun?: LastRun;
  onOpen: () => void;
}) {
  return (
    <Card>
      <div style={ROW_STYLE}>
        <div style={ROW_MAIN_STYLE}>
          <div style={ROW_HEAD_STYLE}>
            <span className="mono" style={METHOD_STYLE}>
              {command.method}
            </span>
            <Badge kind="mute">{command.category}</Badge>
          </div>
          <div
            style={{
              color: "var(--text-dim)",
              fontSize: 12.5,
              marginBottom: command.params.length ? 8 : 0,
            }}
          >
            {command.description}
          </div>
          {command.params.length > 0 && (
            <div style={PARAM_CHIPS_STYLE}>
              {command.params.map((p) => (
                <span
                  key={p.name}
                  className="mono"
                  style={{
                    fontSize: 11,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--border)",
                    color: p.required
                      ? "var(--text-dim)"
                      : "var(--text-muted)",
                  }}
                >
                  {p.name}
                  {p.required ? "" : "?"}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={ROW_ACTIONS_STYLE}>
          {lastRun && (
            <div
              style={LAST_RUN_STYLE}
              title={`Last run: ${new Date(lastRun.at).toLocaleTimeString()}`}
            >
              <StatusLamp status={lastRun.status} />
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--text-faint)" }}
              >
                {lastRun.ms}ms
              </span>
            </div>
          )}
          <Button variant="primary" size="sm" onClick={onOpen}>
            Execute
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CommandDrawer({
  command,
  onClose,
  onResult,
}: {
  command: CommandDef;
  onClose: () => void;
  onResult: (method: string, r: LastRun) => void;
}) {
  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(command.params.map((p) => [p.name, ""])),
  );
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null,
  );
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (command.params.length > 0) {
      firstInputRef.current?.focus();
    } else {
      closeButtonRef.current?.focus();
    }
  }, [command.method, command.params.length]);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setResponseError(null);
    setResponse(null);
    setIsError(false);
    const started = performance.now();
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: command.method,
          params: buildParamsFrom(command, paramValues),
        }),
      });
      const data: unknown = await res.json();
      const ms = Math.round(performance.now() - started);
      setResponse(data);
      const errored =
        !res.ok ||
        (!!data &&
          typeof data === "object" &&
          "error" in data &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          !!(data as any).error);
      setIsError(!!errored);
      onResult(command.method, {
        status: errored ? "err" : "ok",
        ms,
        at: Date.now(),
      });
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      setResponseError(err instanceof Error ? err.message : "Unknown error");
      setIsError(true);
      onResult(command.method, { status: "err", ms, at: Date.now() });
    } finally {
      setLoading(false);
    }
  }, [command, paramValues, onResult]);

  const handleReset = useCallback(() => {
    setParamValues(
      Object.fromEntries(command.params.map((p) => [p.name, ""])),
    );
    setResponse(null);
    setResponseError(null);
    setIsError(false);
  }, [command]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-label={`Run ${command.method}`}
      >
        <div className="drawer-h">
          <Badge kind="mute">{command.category}</Badge>
          <span className="drawer-t">{command.method}</span>
          <button
            ref={closeButtonRef}
            className="drawer-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="drawer-b">
          <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>
            {command.description}
          </p>

          {command.params.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                fontStyle: "italic",
              }}
            >
              No parameters required.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {command.params.map((p, i) => {
                const isMultiline =
                  p.type === "object" ||
                  p.name === "patch" ||
                  p.name === "content";
                return (
                  <div
                    key={p.name}
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                      }}
                    >
                      <span
                        className="mono"
                        style={{ color: "var(--text)", fontWeight: 500 }}
                      >
                        {p.name}
                      </span>
                      <span
                        style={{ color: "var(--text-faint)", fontSize: 11 }}
                      >
                        :{p.type}
                      </span>
                      {p.required && <Badge kind="err">required</Badge>}
                    </label>
                    {p.description && (
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 11.5,
                        }}
                      >
                        {p.description}
                      </span>
                    )}
                    {isMultiline ? (
                      <textarea
                        ref={
                          i === 0
                            ? (el) => {
                                firstInputRef.current = el;
                              }
                            : undefined
                        }
                        className="input mono"
                        rows={4}
                        value={paramValues[p.name] ?? ""}
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [p.name]: e.target.value,
                          }))
                        }
                        placeholder={
                          p.type === "object" ? '{ "key": "value" }' : ""
                        }
                      />
                    ) : (
                      <input
                        ref={
                          i === 0
                            ? (el) => {
                                firstInputRef.current = el;
                              }
                            : undefined
                        }
                        className={p.type === "number" ? "input mono" : "input"}
                        type="text"
                        value={paramValues[p.name] ?? ""}
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [p.name]: e.target.value,
                          }))
                        }
                        placeholder={`Enter ${p.name}…`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(response !== null || responseError) && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  className="section-t"
                  style={{
                    flex: "none",
                    padding: 0,
                    borderBottom: "none",
                  }}
                >
                  Response
                </span>
                {isError ? (
                  <Badge kind="err">error</Badge>
                ) : (
                  <Badge kind="ok">ok</Badge>
                )}
              </div>
              <pre className="codeblock" style={{ marginTop: 0 }}>
                {responseError
                  ? responseError
                  : JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="drawer-f">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={loading}
          >
            Reset
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={loading}
          >
            {loading ? "Running…" : "Run"}
          </Button>
        </div>
      </aside>
    </>
  );
}

export function CommandRunner() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | string>("all");
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, LastRun>>({});

  const totalCount = COMMANDS.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMANDS.filter((c) => {
      if (activeCategory !== "all" && c.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      if (c.method.toLowerCase().includes(q)) return true;
      if (c.description.toLowerCase().includes(q)) return true;
      if (c.params.some((p) => p.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [query, activeCategory]);

  const filteredCount = filtered.length;

  const handleResult = useCallback((method: string, r: LastRun) => {
    setLastRun((prev) => ({ ...prev, [method]: r }));
  }, []);

  const openCommand = openMethod
    ? COMMANDS.find((c) => c.method === openMethod) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Commands"
        sub={`Browse and execute gateway methods · ${totalCount} commands`}
      />

      <div className="cmd-filter-bar" style={FILTER_BAR_STYLE}>
        <input
          className="input"
          placeholder="Search method, description, parameter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <div className="cmd-chips" style={CHIP_ROW_STYLE}>
          <button
            type="button"
            className={`btn btn-sm ${activeCategory === "all" ? "btn-pri" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            All
            <span
              className="mono"
              style={{ marginLeft: 6, opacity: 0.7 }}
            >
              {totalCount}
            </span>
          </button>
          {COMMAND_CATEGORIES.map((cat) => {
            const count = COMMANDS.filter((c) => c.category === cat).length;
            return (
              <button
                type="button"
                key={cat}
                className={`btn btn-sm ${activeCategory === cat ? "btn-pri" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                <span
                  className="mono"
                  style={{ marginLeft: 6, opacity: 0.7 }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className="mono"
          style={{ color: "var(--text-muted)", fontSize: 12 }}
        >
          {filteredCount} shown
        </div>
      </div>

      <div style={LIST_STYLE}>
        {filtered.length === 0 ? (
          <EmptyMsg />
        ) : (
          filtered.map((cmd) => (
            <CommandRow
              key={cmd.method}
              command={cmd}
              lastRun={lastRun[cmd.method]}
              onOpen={() => setOpenMethod(cmd.method)}
            />
          ))
        )}
      </div>

      {openCommand && (
        <CommandDrawer
          command={openCommand}
          onClose={() => setOpenMethod(null)}
          onResult={handleResult}
        />
      )}
    </>
  );
}
