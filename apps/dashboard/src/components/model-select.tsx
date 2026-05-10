"use client";

import { useMemo } from "react";
import type { ModelDescriptor } from "@openclaw-manager/types";

const SELECT_STYLE: React.CSSProperties = {
  background: "var(--bg-sunken)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--text)",
  fontFamily: "inherit",
  minWidth: 220,
};

function formatProviderLabel(provider: string): string {
  return provider.replace(/-/g, " ");
}

function formatModelOption(model: ModelDescriptor): string {
  const parts = [model.displayName || model.id];
  if (model.contextWindow) parts.push(`ctx ${Math.round(model.contextWindow / 1000)}k`);
  if (model.reasoning) parts.push("reasoning");
  if (typeof model.costInput === "number") parts.push(`in $${model.costInput}/M`);
  return parts.join(" - ");
}

function groupCatalog(catalog: ModelDescriptor[]): Map<string, ModelDescriptor[]> {
  const grouped = new Map<string, ModelDescriptor[]>();
  for (const model of catalog) {
    const provider = model.provider || model.id.split("/")[0] || "unknown";
    const list = grouped.get(provider) ?? [];
    list.push(model);
    grouped.set(provider, list);
  }
  for (const [provider, models] of grouped) {
    grouped.set(provider, [...models].sort((a, b) => a.id.localeCompare(b.id)));
  }
  return grouped;
}

export function ModelSelect({
  catalog,
  status,
  value,
  onChange,
  disabled,
  placeholder = "Select a model",
  includeEmpty = false,
  style,
  className,
}: {
  catalog: ModelDescriptor[];
  status: "ok" | "unavailable";
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  includeEmpty?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  const grouped = useMemo(() => groupCatalog(catalog), [catalog]);
  const catalogIds = useMemo(() => new Set(catalog.map((m) => m.id)), [catalog]);
  const hasValueOutsideCatalog = value !== "" && !catalogIds.has(value);
  const isUnavailable = status === "unavailable";

  return (
    <select
      className={className}
      style={{ ...SELECT_STYLE, ...style }}
      value={value}
      disabled={disabled || isUnavailable || catalog.length === 0}
      title={isUnavailable ? "Model catalog is unavailable from the runtime" : undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeEmpty && <option value="">{placeholder}</option>}
      {!includeEmpty && value === "" && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {Array.from(grouped.entries()).map(([provider, models]) => (
        <optgroup key={provider} label={formatProviderLabel(provider)}>
          {models.map((model) => (
            <option key={model.id} value={model.id} title={model.id}>
              {formatModelOption(model)}
            </option>
          ))}
        </optgroup>
      ))}
      {hasValueOutsideCatalog && (
        <option value={value}>{value} (not in catalog)</option>
      )}
    </select>
  );
}
