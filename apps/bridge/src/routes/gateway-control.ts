import { Router, type Request, type Response } from "express";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const router: Router = Router();

const OPENCLAW_CMD = process.env.OPENCLAW_CMD || "openclaw";

async function runOpenClaw(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cmd = [OPENCLAW_CMD, ...args].join(" ");
  return execAsync(cmd, { timeout: 30_000 });
}

// GET /gateway-control/status — check if gateway is running
router.get("/gateway-control/status", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await runOpenClaw("gateway", "status");
    const isRunning = /Runtime:\s*(running|listening)/i.test(stdout);
    res.json({ running: isRunning, raw: stdout });
  } catch (err: any) {
    // If the command fails, gateway is likely not running
    res.json({ running: false, error: err.message });
  }
});

// POST /gateway-control/start — start the gateway
router.post("/gateway-control/start", async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await runOpenClaw("gateway", "start");
    res.json({ ok: true, stdout, stderr });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to start gateway" });
  }
});

// POST /gateway-control/stop — stop the gateway
router.post("/gateway-control/stop", async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await runOpenClaw("gateway", "stop");
    res.json({ ok: true, stdout, stderr });
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to stop gateway" });
  }
});

export default router;
