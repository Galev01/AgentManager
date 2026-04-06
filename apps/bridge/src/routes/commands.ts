import { Router, type Router as ExpressRouter } from "express";
import { enqueueCommand } from "../services/command-queue.js";
import type { CommandType } from "@openclaw-manager/types";

const router: ExpressRouter = Router();

function commandRoute(type: CommandType) {
  return async (req: any, res: any) => {
    try {
      const conversationKey = req.params.conversationKey;
      const command = await enqueueCommand({
        type,
        conversationKey,
        payload: req.body?.payload,
        issuedBy: "dashboard",
      });
      res.status(202).json(command);
    } catch {
      res.status(503).json({ error: "Failed to enqueue command" });
    }
  };
}

router.post("/conversations/:conversationKey/takeover", commandRoute("set_takeover"));
router.post("/conversations/:conversationKey/release", commandRoute("release_takeover"));
router.post("/conversations/:conversationKey/wake-now", commandRoute("wake_now"));

export default router;
