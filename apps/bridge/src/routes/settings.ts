import { Router, type Router as ExpressRouter } from "express";
import { readSettings, writeSettings } from "../services/runtime-settings.js";

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
    const { relayTarget, delayMs, summaryDelayMs, updatedBy } = req.body;
    const updates: Record<string, unknown> = {};
    if (typeof relayTarget === "string") updates.relayTarget = relayTarget;
    if (typeof delayMs === "number") updates.delayMs = delayMs;
    if (typeof summaryDelayMs === "number") updates.summaryDelayMs = summaryDelayMs;
    if (typeof updatedBy === "string") updates.updatedBy = updatedBy;
    else updates.updatedBy = "dashboard";
    const next = await writeSettings(updates);
    res.json(next);
  } catch {
    res.status(503).json({ error: "Failed to write settings" });
  }
});

export default router;
