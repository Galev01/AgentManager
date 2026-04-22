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

// Gateway's config.set / config.apply require:
//   { raw: string (JSON text of the full config), baseHash: string (from last config.get) }
// The dashboard sends `{ config: object, baseHash: string }`; we stringify + forward.
// We intentionally reject silent passthrough so broken callers surface a 400 here
// rather than a 502 from the gateway's param validator.
function validateConfigBody(body: any): { config: Record<string, unknown>; baseHash: string } | { error: string } {
  if (!body || typeof body !== "object") return { error: "request body must be a JSON object" };
  if (typeof body.baseHash !== "string" || body.baseHash.length === 0) {
    return { error: "baseHash (string) is required; re-run GET /gateway-config and retry" };
  }
  if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
    return { error: "config (object) is required" };
  }
  return { config: body.config as Record<string, unknown>, baseHash: body.baseHash };
}

router.patch("/gateway-config", async (req: Request, res: Response) => {
  const parsed = validateConfigBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    res.json(await callGateway("config.set", {
      raw: JSON.stringify(parsed.config),
      baseHash: parsed.baseHash,
    }));
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to set config" });
  }
});

router.post("/gateway-config/apply", async (req: Request, res: Response) => {
  const parsed = validateConfigBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    res.json(await callGateway("config.apply", {
      raw: JSON.stringify(parsed.config),
      baseHash: parsed.baseHash,
    }));
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to apply config" });
  }
});

export default router;
