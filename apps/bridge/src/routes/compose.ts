import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";
import { enqueueCommand } from "../services/command-queue.js";

const router: Router = Router();

router.post("/compose", async (req: Request, res: Response) => {
  try {
    const { conversationKey, phone, text } = req.body;
    if (typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: "phone is required" });
      return;
    }
    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    // Send via OpenClaw gateway chat.send
    const result = await callGateway("chat.send", {
      channel: "whatsapp",
      to: phone.trim(),
      message: text.trim(),
    });

    // Log the command for audit trail
    await enqueueCommand({
      type: "send_message",
      conversationKey: typeof conversationKey === "string" ? conversationKey : undefined,
      payload: { phone: phone.trim(), text: text.trim() },
      issuedBy: "dashboard",
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to send message" });
  }
});

export default router;
