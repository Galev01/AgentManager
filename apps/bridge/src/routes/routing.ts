import { Router, type Request, type Response } from "express";
import {
  listRules,
  upsertRule,
  removeRule,
} from "../services/routing-rules.js";

const router: Router = Router();

router.get("/routing-rules", async (_req: Request, res: Response) => {
  try {
    const rules = await listRules();
    res.json(rules);
  } catch {
    res.status(503).json({ error: "Failed to read routing rules" });
  }
});

router.post("/routing-rules", async (req: Request, res: Response) => {
  try {
    const { conversationKey, phone, displayName, relayRecipientIds, suppressBot, isDefault, note } = req.body;
    const isDefaultRule = isDefault === true;
    const hasKey = typeof conversationKey === "string" && conversationKey.trim().length > 0;
    if (!isDefaultRule && !hasKey) {
      res.status(400).json({ error: "conversationKey is required" });
      return;
    }
    const rule = await upsertRule({
      conversationKey: hasKey ? conversationKey.trim() : "",
      phone: typeof phone === "string" ? phone.trim() : "",
      displayName: typeof displayName === "string" ? displayName : null,
      relayRecipientIds: Array.isArray(relayRecipientIds) ? relayRecipientIds : [],
      suppressBot: suppressBot === true,
      isDefault: isDefaultRule,
      note: typeof note === "string" ? note : "",
    });
    res.status(201).json(rule);
  } catch {
    res.status(503).json({ error: "Failed to create routing rule" });
  }
});

router.put("/routing-rules/:id", async (req: Request, res: Response) => {
  try {
    const { conversationKey, phone, displayName, relayRecipientIds, suppressBot, isDefault, note } = req.body;
    const isDefaultRule = isDefault === true;
    const hasKey = typeof conversationKey === "string" && conversationKey.trim().length > 0;
    if (!isDefaultRule && !hasKey) {
      res.status(400).json({ error: "conversationKey is required" });
      return;
    }
    const rule = await upsertRule({
      id: req.params.id as string,
      conversationKey: hasKey ? conversationKey.trim() : "",
      phone: typeof phone === "string" ? phone.trim() : "",
      displayName: typeof displayName === "string" ? displayName : null,
      relayRecipientIds: Array.isArray(relayRecipientIds) ? relayRecipientIds : [],
      suppressBot: suppressBot === true,
      isDefault: isDefaultRule,
      note: typeof note === "string" ? note : "",
    });
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
