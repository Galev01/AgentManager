"use client";

import { useState } from "react";
import type { Tool, EffectiveTool, Skill } from "@openclaw-manager/types";

type Tab = "catalog" | "effective" | "skills";

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  return (
    <span className="inline-block rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300">
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    installed: "bg-green-900/40 text-green-300",
    available: "bg-blue-900/40 text-blue-300",
    error: "bg-red-900/40 text-red-300",
  };
  const cls = colors[status] ?? "bg-zinc-700 text-zinc-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled?: boolean }) {
  return enabled ? (
    <span className="inline-block rounded-full bg-green-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-300">
      Enabled
    </span>
  ) : (
    <span className="inline-block rounded-full bg-zinc-700/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
      Disabled
    </span>
  );
}

function CatalogTab({ tools }: { tools: Tool[] }) {
  const [search, setSearch] = useState("");

  const filtered = tools.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search tools…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
      />
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-6 py-10 text-center text-sm text-zinc-400">
          No tools found.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <div
              key={tool.name}
              className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-zinc-100 text-sm leading-tight">
                  {tool.name}
                </span>
                <CategoryBadge category={tool.category} />
              </div>
              {tool.description && (
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                  {tool.description}
                </p>
              )}
              {tool.parameters && tool.parameters.length > 0 && (
                <p className="text-[11px] text-zinc-500">
                  {tool.parameters.length} parameter{tool.parameters.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EffectiveTab({ tools }: { tools: EffectiveTool[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
      {tools.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-zinc-400">
          No effective tools found.
        </div>
      ) : (
        <table className="w-full text-sm text-zinc-100">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
              <th className="px-4 py-3">Tool Name</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Assigned To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {tools.map((t) => (
              <tr key={t.name} className="transition hover:bg-zinc-700/30">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3">
                  <EnabledBadge enabled={t.enabled} />
                </td>
                <td className="px-4 py-3 text-zinc-400">{t.assignedTo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
        <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {skills.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No skills found.
          </div>
        ) : (
          <table className="w-full text-sm text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {skills.map((s) => (
                <tr key={s.name} className="transition hover:bg-zinc-700/30">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{s.version ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                    {s.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === "available" && (
                      <button
                        onClick={() => handleInstall(s.name)}
                        disabled={installing === s.name}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {installing === s.name ? "Installing…" : "Install"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "catalog", label: "Catalog", count: catalog.length },
    { id: "effective", label: "Effective", count: effective.length },
    { id: "skills", label: "Skills", count: skills.length },
  ];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeTab === tab.id ? "bg-blue-500/50 text-white" : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {tab.count}
            </span>
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
