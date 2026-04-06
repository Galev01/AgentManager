import { Router, type Router as ExpressRouter } from "express";
import { getConversations } from "../services/openclaw-state.js";
import { readSettings } from "../services/runtime-settings.js";
import type { OverviewData } from "@openclaw-manager/types";

const router: ExpressRouter = Router();

router.get("/overview", async (_req, res) => {
  try {
    const [conversations, settings] = await Promise.all([
      getConversations(),
      readSettings(),
    ]);
    const data: OverviewData = {
      totalConversations: conversations.length,
      activeCount: conversations.filter((c) => c.status === "active").length,
      humanCount: conversations.filter((c) => c.status === "human").length,
      coldCount: conversations.filter((c) => c.status === "cold").length,
      wakingCount: conversations.filter((c) => c.status === "waking").length,
      lastActivityAt: conversations.reduce((max, c) => {
        const ts = c.lastRemoteAt ?? 0;
        return ts > max ? ts : max;
      }, 0) || null,
      relayTarget: settings.relayTarget,
    };
    res.json(data);
  } catch {
    res.status(503).json({ error: "Failed to read state" });
  }
});

export default router;
