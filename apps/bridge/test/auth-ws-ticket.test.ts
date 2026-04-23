import { test } from "node:test";
import assert from "node:assert/strict";
import { createWsTicketStore } from "../src/services/auth/ws-ticket.js";

test("issue + single-use consume", () => {
  const s = createWsTicketStore({ ttlMs: 60_000 });
  const t = s.issue({ userId: "u", sessionId: "sid" });
  assert.equal(s.consume(t.ticket)?.userId, "u");
  assert.equal(s.consume(t.ticket), null);
});
test("expired ticket can't be consumed", () => {
  const s = createWsTicketStore({ ttlMs: -1_000 });
  const t = s.issue({ userId: "u", sessionId: "sid" });
  assert.equal(s.consume(t.ticket), null);
});
test("unknown ticket returns null", () => {
  const s = createWsTicketStore({ ttlMs: 60_000 });
  assert.equal(s.consume("nope"), null);
});
