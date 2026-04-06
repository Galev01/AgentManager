import crypto from "node:crypto";
import { readSettings, writeSettings } from "./runtime-settings.js";
import type { RoutingRule } from "@openclaw-manager/types";

export async function listRules(): Promise<RoutingRule[]> {
  const settings = await readSettings();
  return settings.routingRules;
}

export async function getRuleForConversation(
  conversationKey: string
): Promise<RoutingRule | null> {
  const settings = await readSettings();
  return (
    settings.routingRules.find((r) => r.conversationKey === conversationKey) ??
    null
  );
}

export async function upsertRule(
  input: Omit<RoutingRule, "id"> & { id?: string }
): Promise<RoutingRule> {
  const settings = await readSettings();
  const existing = input.id
    ? settings.routingRules.find((r) => r.id === input.id)
    : null;

  if (existing) {
    Object.assign(existing, input);
    await writeSettings({
      routingRules: settings.routingRules,
      updatedBy: "dashboard",
    });
    return existing;
  }

  const rule: RoutingRule = {
    ...input,
    id: crypto.randomUUID(),
  };
  settings.routingRules.push(rule);
  await writeSettings({
    routingRules: settings.routingRules,
    updatedBy: "dashboard",
  });
  return rule;
}

export async function removeRule(id: string): Promise<boolean> {
  const settings = await readSettings();
  const before = settings.routingRules.length;
  settings.routingRules = settings.routingRules.filter((r) => r.id !== id);
  if (settings.routingRules.length === before) return false;
  await writeSettings({
    routingRules: settings.routingRules,
    updatedBy: "dashboard",
  });
  return true;
}
