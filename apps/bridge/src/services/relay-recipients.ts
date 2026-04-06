import crypto from "node:crypto";
import { readSettings, writeSettings } from "./runtime-settings.js";
import type { RelayRecipient } from "@openclaw-manager/types";

export async function listRecipients(): Promise<RelayRecipient[]> {
  const settings = await readSettings();
  return settings.relayRecipients;
}

export async function addRecipient(
  input: Omit<RelayRecipient, "id">
): Promise<RelayRecipient> {
  const settings = await readSettings();
  const recipient: RelayRecipient = { ...input, id: crypto.randomUUID() };
  settings.relayRecipients.push(recipient);
  await writeSettings({
    relayRecipients: settings.relayRecipients,
    updatedBy: "dashboard",
  });
  return recipient;
}

export async function removeRecipient(id: string): Promise<boolean> {
  const settings = await readSettings();
  const before = settings.relayRecipients.length;
  settings.relayRecipients = settings.relayRecipients.filter((r) => r.id !== id);
  if (settings.relayRecipients.length === before) return false;
  await writeSettings({
    relayRecipients: settings.relayRecipients,
    updatedBy: "dashboard",
  });
  return true;
}

export async function toggleRecipient(
  id: string,
  enabled: boolean
): Promise<RelayRecipient | null> {
  const settings = await readSettings();
  const recipient = settings.relayRecipients.find((r) => r.id === id);
  if (!recipient) return null;
  recipient.enabled = enabled;
  await writeSettings({
    relayRecipients: settings.relayRecipients,
    updatedBy: "dashboard",
  });
  return recipient;
}
