"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  ConversationRow,
  RelayRecipient,
  RoutingRule,
} from "@openclaw-manager/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  SectionTitle,
  Table,
  TableWrap,
} from "./ui";
import { useTelemetry } from "@/lib/telemetry";

interface Props {
  initialRules: RoutingRule[];
  recipients: RelayRecipient[];
  conversations: ConversationRow[];
}

type FormMode = "specific" | "default";
type KeyInputMode = "picker" | "custom";

type FormState = {
  mode: FormMode;
  keyInput: KeyInputMode;
  /** id of the ConversationRow picked (picker mode) — empty until chosen. */
  pickedConversationKey: string;
  /** Raw custom key (custom mode). */
  conversationKey: string;
  phone: string;
  displayName: string;
  note: string;
  selectedRecipientIds: string[];
  suppressBot: boolean;
};

const EMPTY_FORM: FormState = {
  mode: "specific",
  keyInput: "picker",
  pickedConversationKey: "",
  conversationKey: "",
  phone: "",
  displayName: "",
  note: "",
  selectedRecipientIds: [],
  suppressBot: false,
};

// Shared input styling — inline so we don't introduce new CSS classes.
const INPUT_STYLE: CSSProperties = {
  background: "var(--bg-input, var(--bg-hover))",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 13,
  minWidth: 0,
  width: "100%",
  outline: "none",
};

const FIELD_LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  color: "var(--text-muted)",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const LINK_BUTTON_STYLE: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 12,
  textDecoration: "underline",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      {children}
    </label>
  );
}

function RecipientPicker({
  recipients,
  selectedIds,
  onToggle,
}: {
  recipients: RelayRecipient[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (recipients.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        No relay recipients configured.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {recipients.map((r) => {
        const on = selectedIds.includes(r.id);
        return (
          <Button
            key={r.id}
            type="button"
            size="sm"
            variant={on ? "primary" : "ghost"}
            onClick={() => onToggle(r.id)}
          >
            {r.label || r.phone}
          </Button>
        );
      })}
    </div>
  );
}

function RecipientChips({
  ids,
  recipients,
}: {
  ids: string[];
  recipients: RelayRecipient[];
}) {
  if (ids.length === 0) {
    return <span style={{ color: "var(--text-faint)" }}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {ids.map((id) => {
        const r = recipients.find((x) => x.id === id);
        const label = r ? r.label || r.phone : id;
        return (
          <Badge key={id} tone="info">
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

function ConversationCombobox({
  conversations,
  value,
  onChange,
  onFallbackToCustom,
}: {
  conversations: ConversationRow[];
  value: string;
  onChange: (conv: ConversationRow) => void;
  onFallbackToCustom: (typed: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Reflect `value` (e.g., URL prefill) into the visible input text.
  useEffect(() => {
    if (!value) return;
    const row = conversations.find((c) => c.conversationKey === value);
    if (row) setQuery(row.displayName || row.phone || row.conversationKey);
  }, [value, conversations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations.slice(0, 20);
    return conversations
      .filter((c) => {
        const hay = `${c.displayName ?? ""} ${c.phone ?? ""} ${c.conversationKey}`
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [conversations, query]);

  // Close when clicking outside.
  useEffect(() => {
    function handler(ev: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  function commit(i: number) {
    const row = filtered[i];
    if (!row) return;
    onChange(row);
    setQuery(row.displayName || row.phone || row.conversationKey);
    setOpen(false);
  }

  function handleKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (!open && (ev.key === "ArrowDown" || ev.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (filtered.length > 0) {
        commit(highlight);
      } else if (query.trim()) {
        onFallbackToCustom(query.trim());
      }
    } else if (ev.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder="Search conversations by name, phone, or key…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        style={INPUT_STYLE}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            background: "var(--bg-elev, var(--bg))",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                No conversation matches.
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onFallbackToCustom(query.trim())}
              >
                Use custom key {query.trim() ? `"${query.trim()}"` : ""}
              </Button>
            </div>
          ) : (
            filtered.map((row, i) => {
              const isOn = i === highlight;
              const name = row.displayName || "Unknown";
              return (
                <div
                  key={row.conversationKey}
                  role="option"
                  aria-selected={isOn}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    commit(i);
                  }}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: isOn ? "var(--bg-hover)" : "transparent",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontFamily:
                        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                    }}
                  >
                    {row.phone || "—"} · {row.conversationKey}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function RoutingRulesManager({
  initialRules,
  recipients,
  conversations,
}: Props) {
  const { trackOperation } = useTelemetry();
  const searchParams = useSearchParams();
  const [rules, setRules] = useState<RoutingRule[]>(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  // --- URL prefill on mount --------------------------------------------------
  const prefillKey = searchParams?.get("conversationKey") ?? null;
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (didPrefillRef.current) return;
    if (!prefillKey) return;
    didPrefillRef.current = true;
    const row = conversations.find((c) => c.conversationKey === prefillKey);
    if (row) {
      setForm((f) => ({
        ...f,
        mode: "specific",
        keyInput: "picker",
        pickedConversationKey: row.conversationKey,
        conversationKey: row.conversationKey,
        phone: row.phone ?? "",
        displayName: row.displayName ?? "",
      }));
    } else {
      setForm((f) => ({
        ...f,
        mode: "specific",
        keyInput: "custom",
        pickedConversationKey: "",
        conversationKey: prefillKey,
      }));
    }
  }, [prefillKey, conversations]);

  // --- Derived ---------------------------------------------------------------
  const defaultRule = rules.find((r) => r.isDefault) ?? null;
  const specificRules = rules.filter((r) => !r.isDefault);
  const pickedConv =
    form.pickedConversationKey
      ? conversations.find((c) => c.conversationKey === form.pickedConversationKey) ?? null
      : null;

  const subParts = [
    `${specificRules.length} specific rule${specificRules.length === 1 ? "" : "s"}`,
    `default route ${defaultRule ? "on" : "off"}`,
  ];

  // --- Helpers ---------------------------------------------------------------
  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  }

  function loadIntoForm(rule: RoutingRule) {
    const mode: FormMode = rule.isDefault ? "default" : "specific";
    let keyInput: KeyInputMode = "custom";
    let picked = "";
    if (!rule.isDefault) {
      const match = conversations.find(
        (c) => c.conversationKey === rule.conversationKey
      );
      if (match) {
        keyInput = "picker";
        picked = match.conversationKey;
      }
    }
    setForm({
      mode,
      keyInput,
      pickedConversationKey: picked,
      conversationKey: rule.conversationKey ?? "",
      phone: rule.phone ?? "",
      displayName: rule.displayName ?? "",
      note: rule.note ?? "",
      selectedRecipientIds: rule.relayRecipientIds ?? [],
      suppressBot: !!rule.suppressBot,
    });
    setEditingId(rule.id);
    setError(null);
    // Scroll to the form so the user sees the pre-filled state.
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  const toggleRecipient = useCallback((id: string) => {
    setForm((f) => ({
      ...f,
      selectedRecipientIds: f.selectedRecipientIds.includes(id)
        ? f.selectedRecipientIds.filter((x) => x !== id)
        : [...f.selectedRecipientIds, id],
    }));
  }, []);

  // --- Submit ---------------------------------------------------------------
  function buildPayload(): {
    conversationKey: string;
    phone: string;
    displayName: string | null;
    note: string;
    relayRecipientIds: string[];
    suppressBot: boolean;
    isDefault: boolean;
  } | null {
    if (form.mode === "default") {
      return {
        conversationKey: "",
        phone: "",
        displayName: null,
        note: form.note.trim() || "",
        relayRecipientIds: form.selectedRecipientIds,
        suppressBot: form.suppressBot,
        isDefault: true,
      };
    }
    // specific
    let conversationKey = "";
    let phone = "";
    let displayName: string | null = null;
    if (form.keyInput === "picker") {
      if (!pickedConv) {
        setError("Pick a conversation or switch to custom key.");
        return null;
      }
      conversationKey = pickedConv.conversationKey;
      phone = pickedConv.phone ?? "";
      displayName = pickedConv.displayName ?? null;
    } else {
      conversationKey = form.conversationKey.trim();
      if (!conversationKey) {
        setError("Conversation key is required.");
        return null;
      }
      phone = form.phone.trim();
      displayName = form.displayName.trim() || null;
    }
    return {
      conversationKey,
      phone,
      displayName,
      note: form.note.trim() || "",
      relayRecipientIds: form.selectedRecipientIds,
      suppressBot: form.suppressBot,
      isDefault: false,
    };
  }

  async function handleSubmit() {
    setError(null);
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    try {
      if (editingId) {
        const updated = await trackOperation(
          "routing",
          "rule_updated",
          async () => {
            const res = await fetch("/api/routing", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editingId, ...payload }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Failed to update routing rule");
            }
            return (await res.json()) as RoutingRule;
          },
          { ruleId: editingId }
        );
        setRules((prev) => {
          const next = prev.map((r) => (r.id === editingId ? updated : r));
          // When promoting a rule to default, the bridge clears isDefault on
          // all others — pull a fresh list to reflect that. (We don't hit
          // that code path today because mode toggle is disabled in edit,
          // but refetching is cheap insurance.)
          return updated.isDefault
            ? next.map((r) => (r.id === updated.id ? r : { ...r, isDefault: false }))
            : next;
        });
        resetForm();
      } else {
        const created = await trackOperation(
          "routing",
          "rule_created",
          async () => {
            const res = await fetch("/api/routing", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Failed to create routing rule");
            }
            return (await res.json()) as RoutingRule;
          },
          { ruleId: "new" }
        );
        setRules((prev) => {
          const next = [...prev, created];
          // If we just created a default, make sure any other "default" is
          // visually reconciled to not-default (bridge already persisted this).
          return created.isDefault
            ? next.map((r) => (r.id === created.id ? r : { ...r, isDefault: false }))
            : next;
        });
        resetForm();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const was = rules;
    setRules((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) resetForm();
    try {
      await trackOperation(
        "routing",
        "rule_deleted",
        async () => {
          const res = await fetch("/api/routing", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to delete routing rule");
          }
        },
        { ruleId: id }
      );
    } catch (err: unknown) {
      // roll back on failure
      setRules(was);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  function startAddDefault() {
    setForm({
      ...EMPTY_FORM,
      mode: "default",
    });
    setEditingId(null);
    setError(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function handleRefresh() {
    try {
      const res = await fetch("/api/routing");
      if (res.ok) {
        setRules((await res.json()) as RoutingRule[]);
        setError(null);
      }
    } catch {
      // ignore — keep current state
    }
  }

  // --- Render ---------------------------------------------------------------
  const submitLabel =
    form.mode === "default"
      ? editingId
        ? "Save default route"
        : "Create default route"
      : editingId
        ? "Save rule"
        : "Add rule";

  return (
    <>
      <PageHeader
        title="Routing Rules"
        sub={subParts.join(" · ")}
        actions={
          <Button onClick={handleRefresh}>Refresh</Button>
        }
      />

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid var(--err)",
            background: "var(--err-dim)",
            color: "var(--err)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{error}</span>
          <Button size="sm" variant="ghost" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Default Route card */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader>
          <CardTitle>Default Route</CardTitle>
          {defaultRule && (
            <Badge tone="info" style={{ marginLeft: 8 }}>
              default
            </Badge>
          )}
        </CardHeader>
        {defaultRule ? (
          <>
            <CardBody>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  columnGap: 16,
                  rowGap: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Relay to</span>
                <RecipientChips
                  ids={defaultRule.relayRecipientIds}
                  recipients={recipients}
                />
                <span style={{ color: "var(--text-muted)" }}>Suppress bot</span>
                <span>
                  {defaultRule.suppressBot ? (
                    <Badge tone="warn">Yes</Badge>
                  ) : (
                    <Badge tone="neutral">No</Badge>
                  )}
                </span>
                <span style={{ color: "var(--text-muted)" }}>Note</span>
                <span style={{ color: "var(--text)" }}>
                  {defaultRule.note || (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </span>
              </div>
            </CardBody>
            <CardFooter>
              <Button
                variant="secondary"
                onClick={() => loadIntoForm(defaultRule)}
              >
                Edit default
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(defaultRule.id)}
              >
                Remove default
              </Button>
            </CardFooter>
          </>
        ) : (
          <CardBody>
            <EmptyState
              title="No default route configured."
              description="Create one to route conversations that don't match a specific rule."
              action={
                <Button variant="primary" onClick={startAddDefault}>
                  Create default route
                </Button>
              }
            />
          </CardBody>
        )}
      </Card>

      {/* Specific rules table */}
      <SectionTitle>Specific rules</SectionTitle>
      <TableWrap style={{ marginBottom: 20 }}>
        <Table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Phone</th>
              <th>Relay To</th>
              <th>Suppress Bot</th>
              <th>Note</th>
              <th style={{ textAlign: "right", width: 160 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {specificRules.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No specific routing rules."
                    description="Add one below to relay a specific conversation to chosen recipients."
                  />
                </td>
              </tr>
            ) : (
              specificRules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <div className="pri">
                      {rule.displayName || rule.conversationKey}
                    </div>
                    {rule.displayName && (
                      <div
                        className="mono"
                        style={{ fontSize: 11, color: "var(--text-faint)" }}
                      >
                        {rule.conversationKey}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {rule.phone || "—"}
                  </td>
                  <td>
                    <RecipientChips
                      ids={rule.relayRecipientIds}
                      recipients={recipients}
                    />
                  </td>
                  <td>
                    {rule.suppressBot ? (
                      <Badge tone="warn">Yes</Badge>
                    ) : (
                      <Badge tone="neutral">No</Badge>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)", maxWidth: 240 }}>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rule.note || "—"}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <Button size="sm" onClick={() => loadIntoForm(rule)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleDelete(rule.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>

      {/* Add / edit form */}
      <div ref={formRef}>
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId
                ? form.mode === "default"
                  ? "Edit default route"
                  : "Edit rule"
                : "Add routing rule"}
            </CardTitle>
            {editingId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={resetForm}
                style={{ marginLeft: "auto" }}
              >
                Cancel edit
              </Button>
            )}
          </CardHeader>
          <CardBody style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Mode toggle */}
            <div style={{ display: "inline-flex", gap: 4 }}>
              <Button
                variant={form.mode === "specific" ? "primary" : "ghost"}
                onClick={() =>
                  setForm((f) => ({ ...f, mode: "specific" }))
                }
                disabled={!!editingId}
                size="sm"
              >
                Specific route
              </Button>
              <Button
                variant={form.mode === "default" ? "primary" : "ghost"}
                onClick={() =>
                  setForm((f) => ({ ...f, mode: "default" }))
                }
                disabled={!!editingId}
                size="sm"
              >
                Default route
              </Button>
            </div>

            {form.mode === "default" ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontSize: 12.5,
                }}
              >
                Applies to every conversation without a specific rule.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {form.keyInput === "picker" ? (
                  <>
                    <Field label="Conversation">
                      <ConversationCombobox
                        conversations={conversations}
                        value={form.pickedConversationKey}
                        onChange={(row) =>
                          setForm((f) => ({
                            ...f,
                            pickedConversationKey: row.conversationKey,
                            conversationKey: row.conversationKey,
                            phone: row.phone ?? "",
                            displayName: row.displayName ?? "",
                          }))
                        }
                        onFallbackToCustom={(typed) =>
                          setForm((f) => ({
                            ...f,
                            keyInput: "custom",
                            pickedConversationKey: "",
                            conversationKey: typed,
                          }))
                        }
                      />
                    </Field>
                    {pickedConv && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 12,
                        }}
                      >
                        <span>
                          <span style={{ color: "var(--text-faint)" }}>Phone: </span>
                          <span className="mono">{pickedConv.phone || "—"}</span>
                        </span>
                        <span>
                          <span style={{ color: "var(--text-faint)" }}>Key: </span>
                          <span className="mono">{pickedConv.conversationKey}</span>
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      style={LINK_BUTTON_STYLE}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          keyInput: "custom",
                          pickedConversationKey: "",
                        }))
                      }
                    >
                      Use a custom key instead
                    </button>
                  </>
                ) : (
                  <>
                    <Field label="Conversation key">
                      <input
                        type="text"
                        placeholder="e.g. wa:5491166..."
                        value={form.conversationKey}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            conversationKey: e.target.value,
                          }))
                        }
                        style={INPUT_STYLE}
                      />
                    </Field>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                      }}
                    >
                      <Field label="Phone (optional)">
                        <input
                          type="tel"
                          placeholder="+1..."
                          value={form.phone}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, phone: e.target.value }))
                          }
                          style={INPUT_STYLE}
                        />
                      </Field>
                      <Field label="Display name (optional)">
                        <input
                          type="text"
                          value={form.displayName}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              displayName: e.target.value,
                            }))
                          }
                          style={INPUT_STYLE}
                        />
                      </Field>
                    </div>
                    <button
                      type="button"
                      style={LINK_BUTTON_STYLE}
                      onClick={() =>
                        setForm((f) => ({ ...f, keyInput: "picker" }))
                      }
                    >
                      Use a picker instead
                    </button>
                  </>
                )}
              </div>
            )}

            <Field label="Note (optional)">
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                style={INPUT_STYLE}
              />
            </Field>

            <div>
              <span style={FIELD_LABEL_STYLE}>Relay to recipients</span>
              <RecipientPicker
                recipients={recipients}
                selectedIds={form.selectedRecipientIds}
                onToggle={toggleRecipient}
              />
            </div>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.suppressBot}
                onChange={(e) =>
                  setForm((f) => ({ ...f, suppressBot: e.target.checked }))
                }
              />
              Suppress bot for this contact
            </label>
          </CardBody>
          <CardFooter>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Saving…" : submitLabel}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
