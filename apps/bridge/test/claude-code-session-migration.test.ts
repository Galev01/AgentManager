/**
 * Phase D: claude-code session record runtimeId migration.
 *
 * Verifies the read-time backfill + persist-on-write story for legacy
 * sessions that predate `runtimeId`. Exercises:
 *
 *  1. A legacy on-disk record without `runtimeId` reads with the supplied
 *     fallback applied.
 *  2. A subsequent write (e.g. setSessionMode) commits the runtimeId to disk.
 *  3. Re-reading after the write returns the persisted runtimeId, not the
 *     fallback.
 *  4. Records that already carry a runtimeId are returned unchanged
 *     regardless of the fallback.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  listSessions,
  setSessionMode,
  computeSessionId,
  deriveOpenclawSessionId,
  backfillRuntimeId,
} from "../src/services/claude-code-sessions.js";
import type { ClaudeCodeSession } from "@openclaw-manager/types";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cc-mig-"));
}

async function writeLegacyRecord(p: string, partial: Partial<ClaudeCodeSession> & { id: string }): Promise<void> {
  const data = {
    sessions: [
      {
        displayName: partial.displayName ?? "legacy@proj",
        ide: partial.ide ?? "antigravity",
        workspace: partial.workspace ?? "C:\\proj",
        mode: "agent",
        state: "active",
        // runtimeId intentionally absent
        openclawSessionId: deriveOpenclawSessionId(partial.id),
        createdAt: "2025-01-01T00:00:00Z",
        lastActivityAt: "2025-01-01T00:00:00Z",
        messageCount: 0,
        ...partial,
      },
    ],
  };
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf8");
}

test("backfillRuntimeId fills missing runtimeId; passes through populated ones", () => {
  const filled = backfillRuntimeId(
    { id: "abc", openclawSessionId: "cc-abc" } as Partial<ClaudeCodeSession> & { id: string; openclawSessionId: string },
    "oc-main",
  );
  assert.equal(filled.runtimeId, "oc-main");
  assert.equal(filled._legacy, true);

  const passthrough = backfillRuntimeId(
    { id: "abc", runtimeId: "hermes-prod", openclawSessionId: "cc-abc" } as Partial<ClaudeCodeSession> & { id: string; openclawSessionId: string },
    "oc-main",
  );
  assert.equal(passthrough.runtimeId, "hermes-prod");
  assert.notEqual(passthrough._legacy, true);
});

test("listSessions(p, fallback) backfills legacy records on read without rewriting disk", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const id = computeSessionId("antigravity", "C:\\proj");
  await writeLegacyRecord(p, { id });

  const beforeRaw = JSON.parse(await fs.readFile(p, "utf8"));
  assert.equal(beforeRaw.sessions[0].runtimeId, undefined);

  const sessions = await listSessions(p, "oc-main");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.runtimeId, "oc-main");

  // Disk untouched until next write.
  const afterRaw = JSON.parse(await fs.readFile(p, "utf8"));
  assert.equal(afterRaw.sessions[0].runtimeId, undefined);
});

test("any subsequent write persists runtimeId to disk; second read returns persisted value", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const id = computeSessionId("antigravity", "C:\\proj");
  await writeLegacyRecord(p, { id });

  // setSessionMode write — supplies fallback so the legacy record gets fully populated.
  await setSessionMode(p, id, "manual", "oc-main");

  // Disk now has runtimeId persisted.
  const afterRaw = JSON.parse(await fs.readFile(p, "utf8"));
  assert.equal(afterRaw.sessions[0].runtimeId, "oc-main");
  assert.equal(afterRaw.sessions[0].mode, "manual");

  // Subsequent read with a DIFFERENT fallback returns the persisted value
  // (not the fallback) — proves the field is now stored, not recomputed.
  const sessions = await listSessions(p, "different-fallback");
  assert.equal(sessions[0]!.runtimeId, "oc-main");
});

test("listSessions without fallback returns records with whatever runtimeId is on disk (may be missing)", async () => {
  const dir = await tmp();
  const p = path.join(dir, "sessions.json");
  const id = computeSessionId("antigravity", "C:\\proj");
  await writeLegacyRecord(p, { id });

  // Without a fallback, listSessions returns the raw rows. The runtimeId
  // field is absent on legacy records — caller is responsible for handling
  // that case (the orchestrator passes a fallback explicitly).
  const sessions = await listSessions(p);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.runtimeId, undefined);
});
