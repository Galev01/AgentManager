import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextToRefs,
  deriveAuthor,
  newMsgId,
  normalizeEnvelope,
  systemEnvelope,
} from "../src/services/envelope.js";

// ---------------------------------------------------------------------------
// normalizeEnvelope
// ---------------------------------------------------------------------------

test("normalizeEnvelope — assigns bridge-derived author and populates defaults", () => {
  const env = normalizeEnvelope(
    { message: "hi" },
    { authorContext: { kind: "ide", id: "antigravity" } }
  );
  assert.deepEqual(env.author, { kind: "ide", id: "antigravity" });
  assert.equal(env.intent, "report");
  assert.equal(env.state, "new");
  assert.equal(env.artifact, "none");
  assert.equal(env.priority, "normal");
  assert.deepEqual(env.refs, []);
  assert.equal(env.parentMsgId, null);
  assert.match(env.msgId, /^m-[a-f0-9]{12}$/);
  assert.equal(env._intentConfidence, "low");
});

test("normalizeEnvelope — defaults state to in_progress when midThread", () => {
  const env = normalizeEnvelope(
    { message: "still going" },
    { authorContext: { kind: "ide", id: "cli" }, midThread: true }
  );
  assert.equal(env.state, "in_progress");
});

test("normalizeEnvelope — preserves valid caller-supplied envelope fields", () => {
  const env = normalizeEnvelope(
    {
      message: "pick A or B",
      intent: "decide",
      state: "blocked",
      artifact: "question",
      priority: "high",
      parentMsgId: "m-parent",
    },
    { authorContext: { kind: "ide", id: "antigravity" } }
  );
  assert.equal(env.intent, "decide");
  assert.equal(env.state, "blocked");
  assert.equal(env.artifact, "question");
  assert.equal(env.priority, "high");
  assert.equal(env.parentMsgId, "m-parent");
  assert.equal(env._intentConfidence, undefined);
});

test("normalizeEnvelope — coerces invalid intent/state/artifact/priority and preserves raw", () => {
  const env = normalizeEnvelope(
    {
      message: "m",
      intent: "chitchat" as never,
      state: "banana" as never,
      artifact: "novella" as never,
      priority: "CRITICAL" as never,
    },
    { authorContext: { kind: "ide", id: "vscode" } }
  );
  assert.equal(env.intent, "report");
  assert.equal(env.state, "new");
  assert.equal(env.artifact, "none");
  assert.equal(env.priority, "normal");
  assert.deepEqual(env._raw, {
    intent: "chitchat",
    state: "banana",
    artifact: "novella",
  });
  // Note: invalid intent still produces _intentConfidence undefined, since caller DID supply it
  assert.equal(env._intentConfidence, undefined);
});

test("normalizeEnvelope — drops malformed refs, keeps good ones, archives raw", () => {
  const env = normalizeEnvelope(
    {
      message: "m",
      refs: [
        { kind: "file", path: "src/a.ts" },
        { kind: "file" } as never, // missing path
        { kind: "weird" } as never, // bad kind
        { kind: "session", id: "agent:claude-code:cc-xxx", relation: "prior_attempt" },
      ],
    },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.equal(env.refs.length, 2);
  assert.deepEqual(env.refs[0], {
    kind: "file",
    path: "src/a.ts",
    range: undefined,
    relation: undefined,
  });
  assert.deepEqual(env.refs[1], {
    kind: "session",
    id: "agent:claude-code:cc-xxx",
    relation: "prior_attempt",
  });
  assert.equal(env._raw?.refs?.length, 2);
});

test("normalizeEnvelope — maps legacy context {file,selection,stack} to typed refs", () => {
  const env = normalizeEnvelope(
    {
      message: "m",
      // @ts-expect-error -- `context` is legacy on request body but not on the input type
      context: { file: "src/x.ts", range: "L10-L20", stack: "Error at..." },
    },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  const files = env.refs.filter((r) => r.kind === "file");
  const errs = env.refs.filter((r) => r.kind === "error");
  assert.deepEqual(files, [
    { kind: "file", path: "src/x.ts", range: "L10-L20", relation: undefined },
  ]);
  assert.deepEqual(errs, [{ kind: "error", text: "Error at...", relation: undefined }]);
});

test("normalizeEnvelope — reassigns msgId when caller's duplicates an existing one", () => {
  const env = normalizeEnvelope(
    { message: "m", msgId: "m-abcdef123456" },
    {
      authorContext: { kind: "ide", id: "cli" },
      existingMsgIds: new Set(["m-abcdef123456"]),
    }
  );
  assert.notEqual(env.msgId, "m-abcdef123456");
  assert.match(env.msgId, /^m-[a-f0-9]{12}$/);
});

test("normalizeEnvelope — assigns a bridge msgId when caller omits it", () => {
  const env = normalizeEnvelope(
    { message: "m" },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.match(env.msgId, /^m-[a-f0-9]{12}$/);
});

test("normalizeEnvelope — throws when message is missing or empty", () => {
  assert.throws(
    () =>
      normalizeEnvelope({ message: "" }, { authorContext: { kind: "ide", id: "cli" } }),
    /message required/
  );
  assert.throws(
    () =>
      normalizeEnvelope(
        { message: "   " },
        { authorContext: { kind: "ide", id: "cli" } }
      ),
    /message required/
  );
});

test("normalizeEnvelope — ignores caller-supplied author (advisory only)", () => {
  const env = normalizeEnvelope(
    // @ts-expect-error — author is never in CCEnvelopeInput
    { message: "m", author: { kind: "operator", id: "root" } },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.deepEqual(env.author, { kind: "ide", id: "cli" });
});

// --- Added coverage per code-review feedback on Task 2 ---

test("normalizeEnvelope — drops invalid relation on a ref but keeps the ref itself", () => {
  const env = normalizeEnvelope(
    {
      message: "m",
      refs: [{ kind: "file", path: "src/a.ts", relation: "weird" } as never],
    },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.deepEqual(env.refs, [
    { kind: "file", path: "src/a.ts", range: undefined, relation: undefined },
  ]);
  assert.equal(env._raw?.refs, undefined);
});

test("normalizeEnvelope — rejects a ref with a non-string required field (e.g. commit.sha = 42)", () => {
  const env = normalizeEnvelope(
    {
      message: "m",
      refs: [{ kind: "commit", sha: 42 } as never],
    },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.deepEqual(env.refs, []);
  assert.equal(env._raw?.refs?.length, 1);
});

test("normalizeEnvelope — silently replaces a malformed caller-supplied msgId", () => {
  const env = normalizeEnvelope(
    { message: "m", msgId: "not-an-id" },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.match(env.msgId, /^m-[a-f0-9]{12}$/);
  assert.notEqual(env.msgId, "not-an-id");
});

test("normalizeEnvelope — coerces non-array refs to an empty list", () => {
  const env = normalizeEnvelope(
    { message: "m", refs: "not-an-array" as never },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.deepEqual(env.refs, []);
  assert.equal(env._raw?.refs, undefined);
});

test("normalizeEnvelope — inherits parentMsgId from opts.parentMsgIdFallback when caller omits it", () => {
  const env = normalizeEnvelope(
    { message: "child" },
    {
      authorContext: { kind: "ide", id: "cli" },
      parentMsgIdFallback: "m-grandparent",
    }
  );
  assert.equal(env.parentMsgId, "m-grandparent");
});

test("normalizeEnvelope — caller's parentMsgId wins over opts.parentMsgIdFallback", () => {
  const env = normalizeEnvelope(
    { message: "child", parentMsgId: "m-explicit" },
    {
      authorContext: { kind: "ide", id: "cli" },
      parentMsgIdFallback: "m-grandparent",
    }
  );
  assert.equal(env.parentMsgId, "m-explicit");
});

test("normalizeEnvelope — does not set _raw.intent when caller's intent is non-string (e.g. number)", () => {
  const env = normalizeEnvelope(
    { message: "m", intent: 42 as never },
    { authorContext: { kind: "ide", id: "cli" } }
  );
  assert.equal(env.intent, "report");
  assert.equal(env._raw?.intent, undefined);
  // Caller DID supply something, so confidence is NOT marked low.
  assert.equal(env._intentConfidence, undefined);
});

// ---------------------------------------------------------------------------
// deriveAuthor
// ---------------------------------------------------------------------------

test("deriveAuthor — round-trips all four kinds", () => {
  assert.deepEqual(deriveAuthor({ kind: "ide", id: "antigravity" }), {
    kind: "ide",
    id: "antigravity",
  });
  assert.deepEqual(deriveAuthor({ kind: "agent", id: "claude-code" }), {
    kind: "agent",
    id: "claude-code",
  });
  assert.deepEqual(deriveAuthor({ kind: "operator", id: "default" }), {
    kind: "operator",
    id: "default",
  });
  assert.deepEqual(deriveAuthor({ kind: "system", id: "bridge" }), {
    kind: "system",
    id: "bridge",
  });
});

// ---------------------------------------------------------------------------
// systemEnvelope
// ---------------------------------------------------------------------------

test("systemEnvelope — constructs a system-authored turn with parent", () => {
  const env = systemEnvelope("draft expired", "timeout", "bridge", "m-parent");
  assert.deepEqual(env.author, { kind: "system", id: "bridge" });
  assert.equal(env.state, "timeout");
  assert.equal(env.intent, "report");
  assert.equal(env.artifact, "none");
  assert.equal(env.parentMsgId, "m-parent");
  assert.equal(env.message, "draft expired");
});

test("systemEnvelope — accepts null parentMsgId", () => {
  const env = systemEnvelope("bridge restart", "in_progress", "bridge", null);
  assert.equal(env.parentMsgId, null);
});

// ---------------------------------------------------------------------------
// contextToRefs
// ---------------------------------------------------------------------------

test("contextToRefs — returns empty for undefined context", () => {
  assert.deepEqual(contextToRefs(undefined), []);
});

test("contextToRefs — emits file ref with optional range", () => {
  assert.deepEqual(contextToRefs({ file: "a.ts", range: "L1-L5" }), [
    { kind: "file", path: "a.ts", range: "L1-L5" },
  ]);
});

test("contextToRefs — emits error ref for selection without a file", () => {
  assert.deepEqual(contextToRefs({ selection: "let x = 1" }), [
    { kind: "error", text: "let x = 1" },
  ]);
});

test("contextToRefs — skips selection when any file value is present (even non-string)", () => {
  // Guards against future breakage; the current impl drops both branches
  // when file is truthy-but-non-string. Locking the behavior documents it.
  const out = contextToRefs({ file: 42, selection: "let x = 1" });
  assert.deepEqual(out, []);
});

// ---------------------------------------------------------------------------
// newMsgId
// ---------------------------------------------------------------------------

test("newMsgId — matches the m-<hex12> shape", () => {
  assert.match(newMsgId(), /^m-[a-f0-9]{12}$/);
});

test("newMsgId — is unique across calls", () => {
  const a = newMsgId();
  const b = newMsgId();
  assert.notEqual(a, b);
});
