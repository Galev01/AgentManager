import { config } from "../../config.js";
import type { ActorAssertionRef } from "@openclaw-manager/types";
import type { RuntimeRegistry } from "../runtimes/registry.js";
import type { RuntimeConfigService } from "../runtime-config.js";
import {
  requireCapability,
  UnsupportedCapabilityError,
} from "../runtime-resolver.js";
import { buildReviewPrompt as defaultBuildReviewPrompt } from "./prompt.js";
import { buildProjectBrief as defaultBuildProjectBrief } from "./project-brief.js";

export type RunResult = { sessionId: string; markdown: string };

export type RunReviewDeps = {
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
  /** Injectable for tests; defaults to the real buildProjectBrief. */
  buildProjectBrief?: (projectPath: string) => Promise<string>;
  /** Injectable for tests; defaults to the real buildReviewPrompt. */
  buildReviewPrompt?: (opts: {
    projectName: string;
    projectPath: string;
    reportDate: string;
    brief: string;
  }) => string;
};

export type RunReviewOpts = {
  projectName: string;
  projectPath: string;
  reportDate: string;
  /** Override runtime; defaults to effective primary. */
  runtimeId?: string;
  /** Override agent; defaults to config.reviewerAgent. */
  agentName?: string;
};

const SYSTEM_ACTOR: ActorAssertionRef = {
  humanActorUserId: "system",
  managerServiceId: "bridge",
  basis: "service-principal",
};

export async function runReview(opts: RunReviewOpts, deps: RunReviewDeps): Promise<RunResult> {
  const runtimeId =
    opts.runtimeId ?? (await deps.runtimeConfig.read()).effectivePrimaryRuntimeId;
  if (!runtimeId) throw new Error("no runtime available for review run");
  const adapter = await deps.registry.adapter(runtimeId);
  if (!adapter) throw new Error(`runtime '${runtimeId}' has no adapter`);

  await requireCapability(adapter, "sessions.create", runtimeId);
  await requireCapability(adapter, "sessions.send", runtimeId);

  const agentName = opts.agentName ?? config.reviewerAgent;

  const create = await adapter.invokeAction(
    "sessions.create",
    { agentName },
    { actor: SYSTEM_ACTOR },
  );
  if (!create.ok) {
    throw new Error(`sessions.create on '${runtimeId}' failed: ${(create as any).error ?? "unknown"}`);
  }
  const native = (create.nativeResult ?? {}) as Record<string, unknown>;
  const sessionKey =
    (typeof native.key === "string" && native.key) ||
    (typeof native.sessionKey === "string" && native.sessionKey) ||
    (typeof native.id === "string" && native.id) ||
    null;
  if (!sessionKey) {
    throw new Error(`sessions.create on '${runtimeId}' did not return a key`);
  }
  const sessionId =
    (typeof native.sessionId === "string" && native.sessionId) ||
    sessionKey;

  const buildBrief = deps.buildProjectBrief ?? defaultBuildProjectBrief;
  const buildPrompt = deps.buildReviewPrompt ?? defaultBuildReviewPrompt;

  const brief = await buildBrief(opts.projectPath);
  const prompt = buildPrompt({ ...opts, brief });

  const send = await adapter.invokeAction(
    "sessions.send",
    {
      sessionKey,
      message: prompt,
      awaitCompletion: true,
      timeoutMs: config.reviewerTimeoutMs,
    },
    { actor: SYSTEM_ACTOR },
  );
  if (!send.ok) {
    throw new Error(`sessions.send on '${runtimeId}' failed: ${(send as any).error ?? "unknown"}`);
  }
  const sendNative = (send.nativeResult ?? {}) as Record<string, unknown>;
  const assistantText = typeof sendNative.assistantText === "string"
    ? sendNative.assistantText.trim()
    : "";
  if (!assistantText) {
    throw new Error(`empty assistantText from '${runtimeId}'`);
  }

  const idx = assistantText.indexOf("# Codebase Review");
  if (idx < 0) {
    throw new Error("agent output did not include a '# Codebase Review' heading");
  }
  return { sessionId, markdown: assistantText.slice(idx) };
}
