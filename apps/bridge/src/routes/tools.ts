import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

router.get("/tools/catalog", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("tools.catalog", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get catalog" }); }
});

router.get("/tools/effective", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("tools.effective", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get effective tools" }); }
});

router.get("/skills", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("skills.status", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get skills" }); }
});

router.post("/skills/install", async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" }); return;
    }
    res.json(await callGateway("skills.install", { name: name.trim() }));
  } catch (err: any) { res.status(502).json({ error: err.message || "Failed to install skill" }); }
});

export default router;
