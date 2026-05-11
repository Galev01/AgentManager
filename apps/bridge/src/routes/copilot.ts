import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { CopilotStore } from "../services/copilot/store.js";
import type { CopilotOrchestrator } from "../services/copilot/orchestrator.js";
import { TurnInProgressError } from "../services/copilot/orchestrator.js";
import type {
  PermissionId, CopilotSessionCreateInput, CopilotTurnSubmitInput,
  CopilotSessionSnapshot, CopilotMessage, CopilotPendingTurn, BackendKind,
} from "@openclaw-manager/types";

/**
 * Resolves a `runtimeId` from a legacy `backend` value. Returns null when no
 * runtime of the requested kind is configured. Implementations consult the
 * runtime registry; tests pass an inline stub.
 */
export type CopilotBackendToRuntimeResolver = (backend: BackendKind) => Promise<string | null>;

/**
 * Returns the kind of the runtime named by `runtimeId`. Returns null for
 * unknown ids. Used to derive the legacy `backend` field on writes that
 * supply only `runtimeId`.
 */
export type CopilotRuntimeToKindResolver = (runtimeId: string) => Promise<BackendKind | null>;

export type CopilotRouterDeps = {
  store: CopilotStore;
  orchestrator: CopilotOrchestrator;
  /**
   * Called once after `store.createSession` so the appropriate adapter can
   * bootstrap backend-side state (e.g. OpenClaw `sessions.create`).
   */
  backendCreator?: (sessionId: string, ownerUserId: string, backend: BackendKind, runtimeId: string) => Promise<{ openclawSessionKey?: string }>;
  /**
   * Maps legacy `body.backend` → `runtimeId`. Tests typically omit this;
   * production wires it from the runtime registry.
   */
  resolveRuntimeIdForBackend?: CopilotBackendToRuntimeResolver;
  /**
   * Validates a body-supplied `runtimeId` and reports its kind. Tests
   * typically omit this.
   */
  resolveKindForRuntimeId?: CopilotRuntimeToKindResolver;
  log?: (event: string, data: Record<string, unknown>) => void;
};

function requirePerm(...perms: PermissionId[]): RequestHandler<any> {
  return (req: Request, res: Response, next: NextFunction): void => {
    const eff = (req as any).auth?.permissions ?? [];
    for (const p of perms) {
      if (!eff.includes(p)) { res.status(403).json({ error: "forbidden", missing: p }); return; }
    }
    next();
  };
}

function userId(req: Request): string | null {
  return (req as any).auth?.user?.id ?? null;
}

export function createCopilotRouter(deps: CopilotRouterDeps): ExpressRouter {
  const r: ExpressRouter = Router();
  const log = deps.log ?? ((event, data) => console.log(`copilot.${event}`, JSON.stringify(data)));

  async function loadCallerSession(req: Request, res: Response): Promise<{ id: string } | null> {
    const id = String(req.params.id);
    const meta = await deps.store.readMeta(id);
    if (!meta || meta.ownerUserId !== userId(req)) {
      res.status(404).json({ error: "session_not_found" });
      return null;
    }
    return { id };
  }

  r.get("/copilot/sessions", requirePerm("copilot.chat"), async (req, res) => {
    const owner = userId(req);
    if (!owner) { res.status(401).json({ error: "unauthorized" }); return; }
    const list = await deps.store.listSessionsForOwner(owner, 50);
    res.json({ sessions: list });
  });

  r.post("/copilot/sessions", requirePerm("copilot.chat"), async (req, res) => {
    const owner = userId(req);
    if (!owner) { res.status(401).json({ error: "unauthorized" }); return; }
    const body = (req.body ?? {}) as CopilotSessionCreateInput;
    const rawRuntimeId = typeof body.runtimeId === "string" && body.runtimeId.length > 0
      ? body.runtimeId
      : undefined;
    const rawBackend = body.backend;

    // Resolve the (runtimeId, backend) pair. `runtimeId` wins when both are
    // present; otherwise we derive runtimeId from the legacy `backend` value.
    let runtimeId: string;
    let backend: BackendKind;

    if (rawRuntimeId) {
      // Body-supplied runtimeId. Look up its kind for the UI-display alias.
      let kind: BackendKind | null = null;
      if (deps.resolveKindForRuntimeId) {
        kind = await deps.resolveKindForRuntimeId(rawRuntimeId);
        if (!kind) { res.status(400).json({ error: "unknown_runtime_id", runtimeId: rawRuntimeId }); return; }
      } else if (rawBackend === "openclaw" || rawBackend === "hermes") {
        // No registry resolver wired — trust the legacy hint if present.
        kind = rawBackend;
      } else {
        // Without a resolver and without a backend hint, default to openclaw
        // for back-compat with existing callers.
        kind = "openclaw";
      }
      runtimeId = rawRuntimeId;
      backend = kind;
    } else {
      if (rawBackend !== "openclaw" && rawBackend !== "hermes") {
        res.status(400).json({ error: "invalid_backend" });
        return;
      }
      backend = rawBackend;
      if (deps.resolveRuntimeIdForBackend) {
        const resolved = await deps.resolveRuntimeIdForBackend(rawBackend);
        if (!resolved) { res.status(400).json({ error: "no_runtime_for_backend", backend: rawBackend }); return; }
        runtimeId = resolved;
      } else {
        // No registry resolver wired — fall back to using the kind as a
        // synthetic runtime id. Tests that don't care about runtime selection
        // still see a stable, persistable string.
        runtimeId = rawBackend;
      }
    }

    const meta = await deps.store.createSession({
      ownerUserId: owner, runtimeId, backend, title: body.title,
    });
    if (deps.backendCreator) {
      const boot = await deps.backendCreator(meta.id, owner, backend, runtimeId);
      if (boot.openclawSessionKey) {
        await deps.store.updateMeta(meta.id, { openclawSessionKey: boot.openclawSessionKey });
      }
    }
    const final = (await deps.store.readMeta(meta.id))!;
    log("session.created", { user: owner, sessionId: final.id, backend: final.backend, runtimeId: final.runtimeId });
    res.json(final);
  });

  r.get("/copilot/sessions/:id", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const meta = (await deps.store.readMeta(session.id))!;
    const messages = await deps.store.readMessages(session.id, 50);
    const pending = await deps.store.readPending(session.id);
    const snap: CopilotSessionSnapshot = { meta, messages, pending };
    res.json(snap);
  });

  r.delete("/copilot/sessions/:id", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const meta = (await deps.store.readMeta(session.id))!;
    await deps.store.deleteSession(session.id);
    log("session.deleted", { user: userId(req), sessionId: session.id, backend: meta.backend });
    res.status(204).end();
  });

  r.post("/copilot/sessions/:id/turn", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const body = (req.body ?? {}) as CopilotTurnSubmitInput;
    if (typeof body.message !== "string" || body.message.length === 0) {
      res.status(400).json({ error: "invalid_message" });
      return;
    }
    try {
      const { msgId, pending } = await deps.orchestrator.submitTurn({
        sessionId: session.id, userMessageText: body.message,
      });
      res.json({ msg_id: msgId, state: pending.state });
    } catch (e) {
      if (e instanceof TurnInProgressError) {
        res.status(409).json({ error: "turn_in_progress" });
        return;
      }
      console.warn("copilot.turn.submit_error", (e as Error).message);
      res.status(500).json({ error: "adapter_error", detail: (e as Error).message });
    }
  });

  r.get("/copilot/sessions/:id/turn/:msgId", requirePerm("copilot.chat"), async (req, res) => {
    const session = await loadCallerSession(req, res);
    if (!session) return;
    const msgId = String(req.params.msgId);
    const pending = await deps.store.readPending(session.id);
    if (!pending || pending.msg_id !== msgId) {
      res.status(404).json({ error: "turn_not_found" });
      return;
    }
    const messages = await deps.store.readMessages(session.id, 50);
    let assistantMessage: CopilotMessage | null = null;
    if (pending.state === "done") {
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") assistantMessage = last;
    }
    const lastMessageId = messages[messages.length - 1]?.msg_id ?? null;
    const responsePending: CopilotPendingTurn = pending;
    res.json({ pending: responsePending, assistantMessage, lastMessageId });
  });

  return r;
}
