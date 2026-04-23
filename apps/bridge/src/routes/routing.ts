import { Router, type Request, type Response } from "express";
import type { RoutingRule } from "@openclaw-manager/types";
import {
  listRules,
  upsertRule,
  removeRule,
} from "../services/routing-rules.js";

const router: Router = Router();

type ParsedRuleInput = Omit<RoutingRule, "id">;

/**
 * Parse & coerce a raw request body into the shape `upsertRule` expects.
 *
 * Enforces one business rule at the HTTP boundary: a specific rule (the
 * common case) must carry a `conversationKey`. Default rules (`isDefault`)
 * are exempt and always persist with `conversationKey = ""`.
 *
 * Returning a tagged union keeps POST/PUT handlers free of duplicate
 * validation and error-shaping code.
 */
function parseRuleBody(
  body: unknown
): { ok: true; input: ParsedRuleInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const isDefaultRule = b.isDefault === true;
  const rawKey = typeof b.conversationKey === "string" ? b.conversationKey.trim() : "";
  const hasKey = rawKey.length > 0;

  if (!isDefaultRule && !hasKey) {
    return { ok: false, error: "conversationKey is required unless isDefault=true" };
  }

  return {
    ok: true,
    input: {
      conversationKey: hasKey ? rawKey : "",
      phone: typeof b.phone === "string" ? b.phone.trim() : "",
      displayName: typeof b.displayName === "string" ? b.displayName : null,
      relayRecipientIds: Array.isArray(b.relayRecipientIds)
        ? (b.relayRecipientIds as string[])
        : [],
      suppressBot: b.suppressBot === true,
      isDefault: isDefaultRule,
      note: typeof b.note === "string" ? b.note : "",
    },
  };
}

router.get("/routing-rules", async (_req: Request, res: Response) => {
  try {
    const rules = await listRules();
    res.json(rules);
  } catch {
    res.status(503).json({ error: "Failed to read routing rules" });
  }
});

router.post("/routing-rules", async (req: Request, res: Response) => {
  const parsed = parseRuleBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const rule = await upsertRule(parsed.input);
    res.status(201).json(rule);
  } catch {
    res.status(503).json({ error: "Failed to create routing rule" });
  }
});

router.put("/routing-rules/:id", async (req: Request, res: Response) => {
  const parsed = parseRuleBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const rule = await upsertRule({ ...parsed.input, id: req.params.id as string });
    res.json(rule);
  } catch {
    res.status(503).json({ error: "Failed to update routing rule" });
  }
});

router.delete("/routing-rules/:id", async (req: Request, res: Response) => {
  try {
    const removed = await removeRule(req.params.id as string);
    if (!removed) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Failed to remove routing rule" });
  }
});

export default router;
