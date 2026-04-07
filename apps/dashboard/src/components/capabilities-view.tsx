"use client";
import { useState, useMemo } from "react";
import { CAPABILITIES, CATEGORY_META, type CapabilityCategory } from "@/lib/capabilities-data";
import { CapabilityCard } from "./capability-card";

type FilterTab = "all" | CapabilityCategory;

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "channels", label: "Channels" },
  { id: "models", label: "AI Models" },
  { id: "plugins", label: "Plugins" },
  { id: "skills", label: "Skills" },
];

export function CapabilitiesView() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // Count per category
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: CAPABILITIES.length };
    CAPABILITIES.forEach((c) => {
      map[c.category] = (map[c.category] ?? 0) + 1;
    });
    return map;
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return CAPABILITIES.filter((cap) => {
      const matchesCategory = activeTab === "all" || cap.category === activeTab;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        cap.name.toLowerCase().includes(q) ||
        cap.description.toLowerCase().includes(q) ||
        cap.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [search, activeTab]);

  // Group by category for "all" view
  const grouped = useMemo(() => {
    if (activeTab !== "all") return null;
    const map = new Map<CapabilityCategory, typeof filtered>();
    filtered.forEach((cap) => {
      if (!map.has(cap.category)) map.set(cap.category, []);
      map.get(cap.category)!.push(cap);
    });
    return map;
  }, [activeTab, filtered]);

  const categoryOrder: CapabilityCategory[] = ["channels", "models", "plugins", "skills"];

  return (
    <div className="space-y-6">
      {/* ── Top bar: search + tabs ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-sm w-full">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search capabilities..."
            className="block w-full rounded border border-dark-border bg-dark-card pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-gray transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-dark-lighter text-text-gray hover:bg-dark-border hover:text-text-primary"
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-pill px-1.5 py-0.5 text-xs font-medium ${
                    isActive ? "bg-white/20 text-white" : "bg-dark-border text-text-muted"
                  }`}
                >
                  {counts[tab.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 text-5xl opacity-40">🔍</div>
          <p className="text-base font-medium text-text-primary">No capabilities found</p>
          <p className="mt-1 text-sm text-text-muted">
            Try a different search term or category filter.
          </p>
          <button
            onClick={() => { setSearch(""); setActiveTab("all"); }}
            className="mt-4 rounded-pill bg-dark-lighter px-4 py-2 text-sm text-text-gray hover:text-text-primary transition"
          >
            Clear filters
          </button>
        </div>
      ) : activeTab !== "all" ? (
        /* Single category view */
        <div>
          {/* Category header */}
          <div className="mb-5 flex items-center gap-3">
            <span className="text-3xl">{CATEGORY_META[activeTab as CapabilityCategory].icon}</span>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                {CATEGORY_META[activeTab as CapabilityCategory].label}
              </h2>
              <p className="text-sm text-text-muted">
                {CATEGORY_META[activeTab as CapabilityCategory].description}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((cap) => (
              <CapabilityCard key={cap.id} capability={cap} />
            ))}
          </div>
        </div>
      ) : (
        /* All view — grouped by category */
        <div className="space-y-10">
          {categoryOrder.map((cat) => {
            const items = grouped?.get(cat);
            if (!items || items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl">{meta.icon}</span>
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">{meta.label}</h2>
                    <p className="text-xs text-text-muted">{meta.description}</p>
                  </div>
                  <span className="ml-auto rounded-pill bg-dark-lighter px-2.5 py-0.5 text-xs text-text-muted">
                    {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((cap) => (
                    <CapabilityCard key={cap.id} capability={cap} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
