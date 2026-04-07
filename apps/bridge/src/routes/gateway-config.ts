import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

router.get("/gateway-config", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("config.get", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get config" }); }
});

router.get("/gateway-config/schema", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("config.schema", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get schema" }); }
});

router.patch("/gateway-config", async (req: Request, res: Response) => {
  try { res.json(await callGateway("config.set", req.body || {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to set config" }); }
});

router.post("/gateway-config/apply", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("config.apply", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to apply config" }); }
});

export default router;
