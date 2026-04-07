import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

router.get("/channels", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("channels.status", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get channels" }); }
});

router.post("/channels/:name/logout", async (req: Request, res: Response) => {
  try { res.json(await callGateway("channels.logout", { channel: req.params.name as string })); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to logout channel" }); }
});

export default router;
