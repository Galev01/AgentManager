import fs from "node:fs/promises";
import { config } from "../config.js";
import type { ConversationEvent } from "@openclaw-manager/types";

export async function readEvents(options?: {
  conversationKey?: string;
  limit?: number;
  before?: number;
}): Promise<ConversationEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(config.eventsPath, "utf8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  let events: ConversationEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  if (options?.conversationKey) {
    events = events.filter((e) => e.conversationKey === options.conversationKey);
  }
  if (options?.before) {
    events = events.filter((e) => e.at < options.before!);
  }

  events.sort((a, b) => b.at - a.at);

  if (options?.limit) {
    events = events.slice(0, options.limit);
  }

  return events;
}
