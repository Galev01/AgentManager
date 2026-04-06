import { Router, type Router as ExpressRouter } from "express";
import { readSettings } from "../services/runtime-settings.js";
import { enqueueCommand } from "../services/command-queue.js";

const router: ExpressRouter = Router();

router.get("/settings", async (_req, res) => {
  try {
    const settings = await readSettings();
    res.json(settings);
  } catch {
    res.status(503).json({ error: "Failed to read settings" });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    const { relayTarget, delayMs, summaryDelayMs } = req.body;
    const payload: Record<string, unknown> = {};
    if (typeof relayTarget === "string") payload.relayTarget = relayTarget;
    if (typeof delayMs === "number") payload.delayMs = delayMs;
    if (typeof summaryDelayMs === "number") payload.summaryDelayMs = summaryDelayMs;
    const command = await enqueueCommand({
      type: "update_runtime_settings",
      payload,
      issuedBy: "dashboard",
    });
    res.status(202).json(command);
  } catch {
    res.status(503).json({ error: "Failed to enqueue settings update" });
  }
});

export default router;
