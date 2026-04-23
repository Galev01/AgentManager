import { test } from "node:test";
import assert from "node:assert/strict";
import { signAssertion, verifyAssertion } from "../src/services/auth/assertion.js";
const S = "x".repeat(32);

test("sign then verify", () => {
  const t = signAssertion(S, { sub: "u1", sid: "s1", ttlMs: 60_000 });
  const c = verifyAssertion(S, t, { clockSkewMs: 1_000 });
  assert.equal(c!.sub, "u1");
  assert.equal(c!.sid, "s1");
});
test("bad secret", () => {
  const t = signAssertion(S, { sub: "u", sid: "s", ttlMs: 60_000 });
  assert.equal(verifyAssertion("y".repeat(32), t, { clockSkewMs: 1_000 }), null);
});
test("tampered payload", () => {
  const t = signAssertion(S, { sub: "u", sid: "s", ttlMs: 60_000 });
  const [p, sig] = t.split(".");
  const decoded = Buffer.from(p, "base64url").toString("utf8").replace('"u"', '"atk"');
  const tam = Buffer.from(decoded, "utf8").toString("base64url");
  assert.equal(verifyAssertion(S, `${tam}.${sig}`, { clockSkewMs: 1_000 }), null);
});
test("expired", () => {
  const t = signAssertion(S, { sub: "u", sid: "s", ttlMs: -10_000 });
  assert.equal(verifyAssertion(S, t, { clockSkewMs: 0 }), null);
});
test("malformed", () => {
  assert.equal(verifyAssertion(S, "garbage", { clockSkewMs: 0 }), null);
  assert.equal(verifyAssertion(S, "a.b.c", { clockSkewMs: 0 }), null);
});
