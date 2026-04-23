"use client";

import { useState } from "react";
import type { Tool, EffectiveTool, Skill } from "@openclaw-manager/types";
import { mergeToolDoc, type EnrichedTool } from "@/lib/tool-docs";

type Tab = "catalog" | "effective" | "skills";

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  return <span className="badge acc">{category}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const kindMap: Record<string, string> = {
    installed: "ok",
    available: "info",
    error: "err",
  };
  const kind = kindMap[status] ?? "mute";
  return <span className={`badge ${kind}`}>{status}</span>;
}


function CatalogTab({ tools }: { tools: Tool[] }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const enriched: EnrichedTool[] = tools.map(mergeToolDoc);

  const filtered = enriched.filter((t) => {
    const q = search.toLowerCase();
    const hay = [t.name, t.description ?? "", t.doc?.summary ?? "", t.doc?.whenToUse ?? ""]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="space-y-4">
      <input
        type="text"
        aria-label="Search tools"
        placeholder="Search tools, descriptions, or when-to-use…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded border border-[color:var(--border)] bg-[color:var(--bg-sunken)] px-3 py-2 text-sm text-[color:var(--text)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:outline-none"
      />
      {tools.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
          No tools in the catalog yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
          No tools match that search.
        </div>
      ) : (
        <div className="tools-grid">
          {filtered.map((tool) => {
            const summary = tool.doc?.summary ?? tool.description ?? "No description available.";
            const whenToUse = tool.doc?.whenToUse;
            const isOpen = expanded === tool.name;
            return (
              <div key={tool.name} className="card tool-card">
                <div className="tool-card-h">
                  <span className="tool-card-n">{tool.name}</span>
                  <CategoryBadge category={tool.category} />
                </div>
                <p className="tool-card-desc">{summary}</p>
                {whenToUse && (
                  <div className="tool-card-section">
                    <div className="tool-card-label">When to use</div>
                    <p>{whenToUse}</p>
                  </div>
                )}
                {tool.parameters && tool.parameters.length > 0 && (
                  <button
                    className="btn btn-sm"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : tool.name)}
                  >
                    {isOpen
                      ? "Hide parameters"
                      : `Show ${tool.parameters.length} parameter${tool.parameters.length !== 1 ? "s" : ""}`}
                  </button>
                )}
                {isOpen && tool.parameters && (
                  <ul className="tool-card-params">
                    {tool.parameters.map((p) => (
                      <li key={p.name}>
                        <span className="mono">{p.name}</span>
                        <span className="tool-card-ptype mono">{p.type}</span>
                        {p.required && <span className="badge warn">required</span>}
                        {p.description && <span className="tool-card-pdesc">{p.description}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EffectiveTab({ tools }: { tools: EffectiveTool[] }) {
  if (tools.length === 0) {
    return (
      <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
        No tools are currently assigned.
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="tools-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Enabled</th>
            <th>Assigned to</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.name}>
              <td className="mono">{t.name}</td>
              <td>
                <span className={`badge ${t.enabled ? "ok" : "mute"}`}>
                  {t.enabled ? "Enabled" : "Disabled"}
                </span>
              </td>
              <td>{t.assignedTo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillsTab({ skills: initialSkills }: { skills: Skill[] }) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInstall(name: string) {
    setInstalling(name);
    setError(null);
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Install failed");
      }
      setSkills((prev) =>
        prev.map((s) => (s.name === name ? { ...s, status: "installed" as const } : s))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="card"
          style={{
            padding: "12px 14px",
            borderColor: "var(--err)",
            background: "var(--err-dim)",
            color: "var(--err)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {skills.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--text-muted)" }}>
          No skills available.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tools-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Version</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.name}>
                  <td className="mono">{s.name}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="tools-table-dim">{s.version ?? "—"}</td>
                  <td className="tools-table-dim">{s.description ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {s.status === "available" && (
                      <button
                        type="button"
                        className="btn btn-pri btn-sm"
                        onClick={() => handleInstall(s.name)}
                        disabled={installing === s.name}
                      >
                        {installing === s.name ? "Installing…" : "Install"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddCapabilitiesBanner({
  availableCount,
  onGoToSkills,
}: {
  availableCount: number;
  onGoToSkills: () => void;
}) {
  const ctaLabel =
    availableCount > 0
      ? `Browse ${availableCount} available skill${availableCount !== 1 ? "s" : ""} →`
      : "Browse available skills →";
  return (
    <div className="add-caps-banner">
      <div className="add-caps-main">
        <div className="add-caps-eyebrow">
          <span className="dot" />
          Add capabilities
        </div>
        <div className="add-caps-title">
          Install skills to add new tools and workflows
        </div>
        <div className="add-caps-desc">
          Skills are bundles of tools and workflows your agents can use. Install one and its tools will
          appear in the catalog below.
        </div>
        <div className="add-caps-actions">
          <button type="button" className="btn btn-pri" onClick={onGoToSkills}>
            {ctaLabel}
          </button>
        </div>
        <div className="muted-note">
          Need a custom tool? Custom tool creation needs gateway support and isn't available in the dashboard yet.
        </div>
      </div>
    </div>
  );
}

export function ToolsPanel({
  catalog,
  effective,
  skills,
}: {
  catalog: Tool[];
  effective: EffectiveTool[];
  skills: Skill[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("catalog");

  const availableCount = skills.filter((s) => s.status === "available").length;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "catalog", label: "Catalog", count: catalog.length },
    { id: "effective", label: "Effective", count: effective.length },
    { id: "skills", label: "Skills", count: skills.length },
  ];

  return (
    <div className="space-y-6">
      <AddCapabilitiesBanner availableCount={availableCount} onGoToSkills={() => setActiveTab("skills")} />
      {/* Tab bar */}
      <div className="tools-tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tools-tab ${activeTab === tab.id ? "active" : ""}`}
          >
            <span>{tab.label}</span>
            <span className="badge mute">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "catalog" && <CatalogTab tools={catalog} />}
      {activeTab === "effective" && <EffectiveTab tools={effective} />}
      {activeTab === "skills" && <SkillsTab skills={skills} />}
    </div>
  );
}
