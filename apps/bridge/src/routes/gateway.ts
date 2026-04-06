import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

// Generic gateway proxy — POST /gateway/:method
router.post("/gateway/:method", async (req: Request, res: Response) => {
  try {
    const method = String(req.params.method);
    const params = req.body || {};
    const result = await callGateway(method, params);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Gateway request failed" });
  }
});

// Nested methods like agents.list -> POST /gateway/agents/list
router.post("/gateway/:ns/:action", async (req: Request, res: Response) => {
  try {
    const method = `${req.params.ns}.${req.params.action}`;
    const params = req.body || {};
    const result = await callGateway(method, params);
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Gateway request failed" });
  }
});

export default router;
