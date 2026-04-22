import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClaudeCodeTranscriptEvent } from "@openclaw-manager/types";
import { summarizeSession } from "../src/services/claude-code-summarize.js";

test("summarizeSession uses the configured agent and includes draft context", async () => {
  const events: ClaudeCodeTranscriptEvent[] = [
    {
      t: new Date().toISOString(),
      kind: "ask",
      msgId: "m-1",
      question: "Please fix why the session summary only shows a preview.",
    },
    {
      t: new Date().toISOString(),
      kind: "draft",
      msgId: "m-1",
      draft: "Use OpenClaw to generate the summary instead of deriving it in the dashboard.",
    },
  ];

  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];

  const summary = await summarizeSession(events, {
    agentId: "claude-code",
    callGateway: async (method, params) => {
      calls.push({ method, params });

      if (method === "sessions.create") {
        return { sessionId: "summary-1" };
      }

      if (method === "sessions.send") {
        assert.match(String(params?.key ?? ""), /^agent:claude-code:cc-summary-/);
        const prompt = String(params?.message ?? "");
        assert.match(prompt, /summary only shows a preview/i);
        assert.match(
          prompt,
          /generate the summary instead of deriving it in the dashboard/i
        );
        return { ok: true };
      }

      if (method === "sessions.get") {
        return {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "prompt" }],
            },
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Claude Code asked for a real OpenClaw-written summary, and OpenClaw proposed replacing the dashboard preview with an LLM-generated summary.",
                },
              ],
            },
          ],
        };
      }

      if (method === "sessions.delete") {
        return { ok: true };
      }

      throw new Error(`unexpected method ${method}`);
    },
  });

  assert.match(summary ?? "", /OpenClaw-written summary/i);
  assert.ok(calls.some((call) => call.method === "sessions.delete"));
});

test("summarizeSession ignores draft text once a final answer exists", async () => {
  const events: ClaudeCodeTranscriptEvent[] = [
    {
      t: new Date().toISOString(),
      kind: "ask",
      msgId: "m-1",
      question: "Which fix should we ship?",
    },
    {
      t: new Date().toISOString(),
      kind: "draft",
      msgId: "m-1",
      draft: "Old draft that should not be summarized once the final answer exists.",
    },
    {
      t: new Date().toISOString(),
      kind: "answer",
      msgId: "m-1",
      answer: "Ship the cached OpenClaw summary path.",
      source: "agent",
    },
  ];

  await summarizeSession(events, {
    callGateway: async (method, params) => {
      if (method === "sessions.create") return { sessionId: "summary-2" };
      if (method === "sessions.send") {
        const prompt = String(params?.message ?? "");
        assert.doesNotMatch(prompt, /Old draft that should not be summarized/i);
        assert.match(prompt, /Ship the cached OpenClaw summary path/i);
        return { ok: true };
      }
      if (method === "sessions.get") {
        return {
          messages: [
            { role: "user", content: [{ type: "text", text: "prompt" }] },
            { role: "assistant", content: [{ type: "text", text: "summary" }] },
          ],
        };
      }
      if (method === "sessions.delete") return { ok: true };
      throw new Error(`unexpected method ${method}`);
    },
  });
});
