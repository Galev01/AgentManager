import fs from "node:fs/promises";
import { config } from "../config.js";
import type { ConversationRow, ConversationStatus } from "@openclaw-manager/types";

type PluginConversation = {
  status?: string;
  firstName?: string;
  senderName?: string;
  awaitingRelay?: boolean;
  lastRemoteAt?: number;
  lastRemoteContent?: string;
  lastAgentReplyAt?: number;
  lastHumanReplyAt?: number;
};

type PluginState = {
  conversations?: Record<string, PluginConversation>;
};

function parseConversationKey(key: string): { phone: string } {
  const parts = key.split(":");
  return { phone: parts.length >= 3 ? parts.slice(2).join(":") : key };
}

function toStatus(raw: string | undefined): ConversationStatus {
  if (raw === "active" || raw === "human" || raw === "waking" || raw === "cold") return raw;
  return "cold";
}

export async function readPluginState(): Promise<PluginState> {
  try {
    const raw = await fs.readFile(config.openclawStatePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { conversations: {} };
  }
}

export async function getConversations(): Promise<ConversationRow[]> {
  const state = await readPluginState();
  if (!state.conversations) return [];
  return Object.entries(state.conversations).map(([key, conv]) => {
    const { phone } = parseConversationKey(key);
    return {
      conversationKey: key,
      phone,
      displayName: conv.senderName || conv.firstName || null,
      status: toStatus(conv.status),
      lastRemoteAt: conv.lastRemoteAt ?? null,
      lastRemoteContent: conv.lastRemoteContent ?? null,
      lastAgentReplyAt: conv.lastAgentReplyAt ?? null,
      lastHumanReplyAt: conv.lastHumanReplyAt ?? null,
      awaitingRelay: conv.awaitingRelay === true,
    };
  });
}

export async function getConversation(conversationKey: string): Promise<ConversationRow | null> {
  const all = await getConversations();
  return all.find((c) => c.conversationKey === conversationKey) ?? null;
}
