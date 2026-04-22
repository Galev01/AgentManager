import crypto from "node:crypto";
import { readSettings, writeSettings } from "./runtime-settings.js";
import type { RoutingRule } from "@openclaw-manager/types";

function normalize(rule: RoutingRule): RoutingRule {
  // Legacy persisted rules may predate the `isDefault` field. Coerce missing
  // values to `false` so callers never see `undefined`.
  return { ...rule, isDefault: rule.isDefault === true };
}

export async function listRules(): Promise<RoutingRule[]> {
  const settings = await readSettings();
  return settings.routingRules.map(normalize);
}

export async function getDefaultRule(): Promise<RoutingRule | null> {
  const settings = await readSettings();
  const found = settings.routingRules.find((r) => r.isDefault === true);
  return found ? normalize(found) : null;
}

export async function getRuleForConversation(
  conversationKey: string
): Promise<RoutingRule | null> {
  const settings = await readSettings();
  const exact = settings.routingRules.find(
    (r) => r.conversationKey === conversationKey
  );
  if (exact) return normalize(exact);
  const fallback = settings.routingRules.find((r) => r.isDefault === true);
  return fallback ? normalize(fallback) : null;
}

export async function upsertRule(
  input: Omit<RoutingRule, "id"> & { id?: string }
): Promise<RoutingRule> {
  const settings = await readSettings();
  // Work on a fresh array so we don't mutate the settings object we read
  // (in particular, never mutate the default-settings array shared by
  // `readSettings` when the file is missing).
  const rules: RoutingRule[] = settings.routingRules.slice();
  const isDefault = input.isDefault === true;

  // Enforce "at most one default" server-side: clear the flag on every other
  // rule before writing.
  if (isDefault) {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i]!;
      if (r.id !== input.id && r.isDefault === true) {
        rules[i] = { ...r, isDefault: false };
      }
    }
  }

  const existingIndex = input.id
    ? rules.findIndex((r) => r.id === input.id)
    : -1;

  if (existingIndex !== -1) {
    const existing = rules[existingIndex]!;
    const updated: RoutingRule = { ...existing, ...input, isDefault };
    rules[existingIndex] = updated;
    await writeSettings({ routingRules: rules, updatedBy: "dashboard" });
    return normalize(updated);
  }

  const rule: RoutingRule = {
    ...input,
    isDefault,
    id: crypto.randomUUID(),
  };
  rules.push(rule);
  await writeSettings({ routingRules: rules, updatedBy: "dashboard" });
  return normalize(rule);
}

export async function removeRule(id: string): Promise<boolean> {
  const settings = await readSettings();
  const filtered = settings.routingRules.filter((r) => r.id !== id);
  if (filtered.length === settings.routingRules.length) return false;
  await writeSettings({ routingRules: filtered, updatedBy: "dashboard" });
  return true;
}
