import { Router, type Router as ExpressRouter } from "express";
import { readEvents } from "../services/event-log.js";

const router: ExpressRouter = Router();

router.get("/messages", async (req, res) => {
  try {
    const conversationKey = req.query.conversationKey as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = req.query.before ? Number(req.query.before) : undefined;
    const events = await readEvents({ conversationKey, limit, before });
    res.json(events);
  } catch {
    res.status(503).json({ error: "Failed to read events" });
  }
});

export default router;
