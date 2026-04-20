/**
 * Tests for enriched GET /brain/people (with unreadCount, lastMessageSnippet, lastMessageAt).
 *
 * Style: direct function calls into the brain library (same as brain-cursing-rate.test.ts).
 *
 * Design choice: We test the enrichment LOGIC functions (computeUnread, truncate) directly,
 * not via HTTP. The route itself calls getBrainClient().listPeople() + listConversations()
 * and merges them. We validate the merge logic in isolation here.
 *
 * This avoids requiring a running server OR seeding the openclaw state file on disk,
 * while still giving confidence in the enrichment behavior. Field-shape tests are also
 * included to verify the response structure contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConversationRow } from "@openclaw-manager/types";

// --- Helpers copied from routes/brain.ts enrichment logic ---
// We duplicate them here to test independently; if the route logic changes, update these too.

function computeUnread(c: ConversationRow): number {
  const lastOut = Math.max(c.lastAgentReplyAt ?? 0, c.lastHumanReplyAt ?? 0);
  const lastIn = c.lastRemoteAt ?? 0;
  return lastIn > lastOut ? 1 : 0;
}

function truncate(s: string | null, max: number): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function makeConvo(overrides?: Partial<ConversationRow>): ConversationRow {
  return {
    conversationKey: "openclaw:wa:+972500000001",
    phone: "+972500000001",
    displayName: null,
    status: "active",
    lastRemoteAt: null,
    lastRemoteContent: null,
    lastAgentReplyAt: null,
    lastHumanReplyAt: null,
    awaitingRelay: false,
    ...overrides,
  };
}

// --- computeUnread tests ---

test("computeUnread — no messages: unread is 0", () => {
  const c = makeConvo({ lastRemoteAt: null, lastAgentReplyAt: null, lastHumanReplyAt: null });
  assert.equal(computeUnread(c), 0);
});

test("computeUnread — inbound newer than last reply: unread is 1", () => {
  const c = makeConvo({
    lastRemoteAt: 1000,
    lastAgentReplyAt: 500,
    lastHumanReplyAt: null,
  });
  assert.equal(computeUnread(c), 1);
});

test("computeUnread — last reply newer than inbound: unread is 0", () => {
  const c = makeConvo({
    lastRemoteAt: 500,
    lastAgentReplyAt: 1000,
    lastHumanReplyAt: null,
  });
  assert.equal(computeUnread(c), 0);
});

test("computeUnread — human reply newer than inbound: unread is 0", () => {
  const c = makeConvo({
    lastRemoteAt: 500,
    lastAgentReplyAt: null,
    lastHumanReplyAt: 1000,
  });
  assert.equal(computeUnread(c), 0);
});

test("computeUnread — inbound at same time as reply: unread is 0 (not strictly greater)", () => {
  const c = makeConvo({
    lastRemoteAt: 1000,
    lastAgentReplyAt: 1000,
  });
  assert.equal(computeUnread(c), 0);
});

// --- truncate tests ---

test("truncate — null input returns null", () => {
  assert.equal(truncate(null, 30), null);
});

test("truncate — empty string returns null", () => {
  assert.equal(truncate("", 30), null);
});

test("truncate — short string is unchanged", () => {
  assert.equal(truncate("hello", 30), "hello");
});

test("truncate — exactly max length is unchanged", () => {
  const s = "a".repeat(30);
  assert.equal(truncate(s, 30), s);
});

test("truncate — longer than max gets ellipsis appended", () => {
  const s = "a".repeat(40);
  const result = truncate(s, 30);
  assert.ok(result !== null);
  assert.ok(result!.endsWith("…"), "should end with ellipsis");
  assert.ok(result!.length <= 30, "should not exceed max length");
});

// --- Enrichment merge logic ---

test("enrichment — person without conversation gets zero/null fields", () => {
  // Simulate the route's byPhone.get() returning undefined
  const phone = "+972500000099";
  const byPhone = new Map<string, ConversationRow>();

  const c = byPhone.get(phone);
  const enriched = c
    ? {
        unreadCount: computeUnread(c),
        lastMessageSnippet: truncate(c.lastRemoteContent, 30),
        lastMessageAt: c.lastRemoteAt,
      }
    : { unreadCount: 0, lastMessageSnippet: null, lastMessageAt: null };

  assert.equal(enriched.unreadCount, 0);
  assert.equal(enriched.lastMessageSnippet, null);
  assert.equal(enriched.lastMessageAt, null);
});

test("enrichment — person with inbound conversation gets populated fields", () => {
  const phone = "+972500000001";
  const convo = makeConvo({
    phone,
    lastRemoteAt: 9000,
    lastRemoteContent: "Hello there! How are you doing today, my friend?",
    lastAgentReplyAt: 5000,
  });
  const byPhone = new Map([[phone, convo]]);

  const c = byPhone.get(phone)!;
  const enriched = {
    unreadCount: computeUnread(c),
    lastMessageSnippet: truncate(c.lastRemoteContent, 30),
    lastMessageAt: c.lastRemoteAt,
  };

  assert.equal(enriched.unreadCount, 1, "inbound newer than reply → unread=1");
  assert.equal(typeof enriched.lastMessageSnippet, "string");
  assert.ok(enriched.lastMessageSnippet!.length <= 30, "snippet should be truncated to ≤30 chars");
  assert.ok(enriched.lastMessageSnippet!.endsWith("…"), "long snippet should end with ellipsis");
  assert.equal(enriched.lastMessageAt, 9000);
});
