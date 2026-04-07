import { Router, type Request, type Response } from "express";
import { callGateway } from "../services/gateway.js";

const router: Router = Router();

router.get("/cron", async (_req: Request, res: Response) => {
  try { res.json(await callGateway("cron.list", {})); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to list cron jobs" }); }
});

router.post("/cron", async (req: Request, res: Response) => {
  try {
    const { schedule, command, agentName, name } = req.body;
    if (typeof schedule !== "string" || !schedule.trim()) {
      res.status(400).json({ error: "schedule is required" }); return;
    }
    const params: Record<string, unknown> = { schedule: schedule.trim() };
    if (typeof command === "string") params.command = command;
    if (typeof agentName === "string") params.agent = agentName;
    if (typeof name === "string") params.name = name;
    res.status(201).json(await callGateway("cron.add", params));
  } catch (err: any) { res.status(502).json({ error: err.message || "Failed to add cron job" }); }
});

router.get("/cron/:id/status", async (req: Request, res: Response) => {
  try { res.json(await callGateway("cron.status", { id: req.params.id as string })); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to get status" }); }
});

router.post("/cron/:id/run", async (req: Request, res: Response) => {
  try { res.json(await callGateway("cron.run", { id: req.params.id as string })); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to run job" }); }
});

router.delete("/cron/:id", async (req: Request, res: Response) => {
  try { res.json(await callGateway("cron.remove", { id: req.params.id as string })); }
  catch (err: any) { res.status(502).json({ error: err.message || "Failed to remove job" }); }
});

export default router;
