import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEnvelope } from "../src/services/envelope.js";

test("envelope preserves runtime_kind + native_ref unchanged", () => {
  const e = normalizeEnvelope(
    { message: "x", runtime_kind: "hermes", runtime_id: "h1", projection_mode: "partial", lossiness: "lossy", native_ref: { foo: 1 } },
    { authorContext: { kind: "agent", id: "a" }, midThread: true, parentMsgIdFallback: "p" },
  );
  assert.equal(e.runtime_kind, "hermes");
  assert.equal(e.runtime_id, "h1");
  assert.equal(e.projection_mode, "partial");
  assert.equal(e.lossiness, "lossy");
  assert.deepEqual(e.native_ref, { foo: 1 });
});

test("envelope defaults projection_mode to exact when runtime_kind set and projection_mode omitted", () => {
  const e = normalizeEnvelope(
    { message: "x", runtime_kind: "openclaw", runtime_id: "oc-main" },
    { authorContext: { kind: "agent", id: "a" }, midThread: true, parentMsgIdFallback: "p" },
  );
  assert.equal(e.projection_mode, "exact");
  assert.equal(e.lossiness, "none");
});
