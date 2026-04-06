import { Router, type Router as ExpressRouter } from "express";
import { getConversations, getConversation } from "../services/openclaw-state.js";

const router: ExpressRouter = Router();

router.get("/conversations", async (_req, res) => {
  try {
    const conversations = await getConversations();
    res.json(conversations);
  } catch {
    res.status(503).json({ error: "Failed to read state" });
  }
});

router.get("/conversations/:conversationKey", async (req, res) => {
  try {
    const conv = await getConversation(req.params.conversationKey);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.json(conv);
  } catch {
    res.status(503).json({ error: "Failed to read state" });
  }
});

export default router;
