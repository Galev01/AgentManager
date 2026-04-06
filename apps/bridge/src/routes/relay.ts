import { Router, type Request, type Response } from "express";
import {
  listRecipients,
  addRecipient,
  removeRecipient,
  toggleRecipient,
} from "../services/relay-recipients.js";

const router: Router = Router();

router.get("/relay-recipients", async (_req: Request, res: Response) => {
  try {
    const recipients = await listRecipients();
    res.json(recipients);
  } catch {
    res.status(503).json({ error: "Failed to read relay recipients" });
  }
});

router.post("/relay-recipients", async (req: Request, res: Response) => {
  try {
    const { phone, label, enabled } = req.body;
    if (typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ error: "phone is required" });
      return;
    }
    const recipient = await addRecipient({
      phone: phone.trim(),
      label: typeof label === "string" ? label.trim() : phone.trim(),
      enabled: enabled !== false,
    });
    res.status(201).json(recipient);
  } catch {
    res.status(503).json({ error: "Failed to add relay recipient" });
  }
});

router.delete("/relay-recipients/:id", async (req: Request, res: Response) => {
  try {
    const removed = await removeRecipient(req.params.id as string);
    if (!removed) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Failed to remove relay recipient" });
  }
});

router.patch("/relay-recipients/:id", async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }
    const updated = await toggleRecipient(req.params.id as string, enabled);
    if (!updated) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }
    res.json(updated);
  } catch {
    res.status(503).json({ error: "Failed to toggle relay recipient" });
  }
});

export default router;
