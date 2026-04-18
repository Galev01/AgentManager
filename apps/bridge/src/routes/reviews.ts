import fs from "node:fs/promises";
import { Router, type Request, type Response } from "express";
import {
  getProject,
  listProjects,
  updateProject,
} from "../services/codebase-reviewer/state.js";
import { scanProjects } from "../services/codebase-reviewer/discovery.js";
import {
  enqueue,
  enqueueAllEligible,
  getWorkerState,
} from "../services/codebase-reviewer/worker.js";
import { computeEligibleAtAfterAck } from "../services/codebase-reviewer/scheduler.js";
import { tailRuns } from "../services/codebase-reviewer/runs.js";
import {
  listIdeas,
  listIdeasForReport,
  setIdeaStatus,
} from "../services/codebase-reviewer/ideas.js";
import type {
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
  ReviewReportSummary,
} from "@openclaw-manager/types";
import { deriveSeverity } from "../services/codebase-reviewer/severity.js";
import path from "node:path";

const router: Router = Router();

const ID_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badId(res: Response): void {
  res.status(400).json({ error: "invalid id" });
}
function badDate(res: Response): void {
  res.status(400).json({ error: "invalid date" });
}

router.get("/reviews/projects", async (_req: Request, res: Response) => {
  try {
    const projects = await listProjects();
    res.json({ projects, worker: getWorkerState() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/reviews/projects/scan", async (_req: Request, res: Response) => {
  try {
    const result = await scanProjects();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.patch("/reviews/projects/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!ID_RE.test(id)) return badId(res);
  try {
    const existing = await getProject(id);
    if (!existing) return void res.status(404).json({ error: "not found" });
    const patch: { enabled?: boolean } = {};
    if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
    const next = await updateProject(id, patch);
    res.json({ project: next });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/reviews/projects/:id/run", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!ID_RE.test(id)) return badId(res);
  try {
    const project = await getProject(id);
    if (!project) return void res.status(404).json({ error: "not found" });
    if (project.missing) {
      return void res
        .status(409)
        .json({ enqueued: false, reason: "project folder missing" });
    }
    const ok = enqueue(id, "manual");
    res.json({ enqueued: ok, reason: ok ? undefined : "already queued or running" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/reviews/projects/:id/ack", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!ID_RE.test(id)) return badId(res);
  try {
    const project = await getProject(id);
    if (!project) return void res.status(404).json({ error: "not found" });
    const now = new Date();
    const next = await updateProject(id, {
      status: "idle",
      lastAckedAt: now.toISOString(),
      eligibleAt: computeEligibleAtAfterAck(now),
    });
    res.json({ project: next });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get(
  "/reviews/projects/:id/reports",
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!ID_RE.test(id)) return badId(res);
    try {
      const project = await getProject(id);
      if (!project) return void res.status(404).json({ error: "not found" });
      const dir = path.join(project.path, ".openclaw-review");
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      } catch {
        files = [];
      }
      files.sort((a, b) => (a < b ? 1 : -1));
      const summaries: ReviewReportSummary[] = [];
      for (const f of files) {
        const date = f.replace(/\.md$/, "");
        const ideas = await listIdeasForReport(id, date);
        summaries.push({
          reportDate: date,
          reportPath: path.join(dir, f),
          ideasCount: ideas.length,
          acked:
            project.lastReportDate === date
              ? project.lastAckedAt !== null
              : true,
          severity: deriveSeverity(ideas),
          triageState: "new",
          triageChangedAt: null,
        });
      }
      res.json({ reports: summaries });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "failed" });
    }
  }
);

router.get(
  "/reviews/projects/:id/reports/:date",
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const date = req.params.date as string;
    if (!ID_RE.test(id)) return badId(res);
    if (!DATE_RE.test(date)) return badDate(res);
    try {
      const project = await getProject(id);
      if (!project) return void res.status(404).json({ error: "not found" });
      const file = path.join(project.path, ".openclaw-review", `${date}.md`);
      let markdown: string;
      try {
        markdown = await fs.readFile(file, "utf8");
      } catch {
        return void res.status(404).json({ error: "report not found" });
      }
      const ideas = await listIdeasForReport(id, date);
      res.json({ markdown, ideas });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "failed" });
    }
  }
);

function parseArrayParam<T extends string>(
  raw: unknown,
  allowed: Set<T>
): T[] | undefined {
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const strs = arr.map((v) => String(v)).filter((s) => allowed.has(s as T)) as T[];
  return strs.length ? strs : undefined;
}

router.get("/reviews/ideas", async (req: Request, res: Response) => {
  try {
    const ideas = await listIdeas({
      projectId: Array.isArray(req.query.project)
        ? req.query.project.map(String)
        : req.query.project
          ? [String(req.query.project)]
          : undefined,
      status: parseArrayParam<ReviewIdeaStatus>(
        req.query.status,
        new Set(["pending", "accepted", "rejected", "deferred"])
      ),
      impact: parseArrayParam<ReviewIdeaImpact>(
        req.query.impact,
        new Set(["low", "medium", "high"])
      ),
      effort: parseArrayParam<ReviewIdeaEffort>(
        req.query.effort,
        new Set(["S", "M", "L"])
      ),
      category: parseArrayParam<ReviewIdeaCategory>(
        req.query.category,
        new Set(["new_feature", "improvement", "ui_ux", "tech_debt"])
      ),
    });
    res.json({ ideas });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.patch("/reviews/ideas/:id", async (req: Request, res: Response) => {
  try {
    const status = req.body?.status as ReviewIdeaStatus | undefined;
    if (!status || !["pending", "accepted", "rejected", "deferred"].includes(status)) {
      return void res.status(400).json({ error: "invalid status" });
    }
    const idea = await setIdeaStatus(req.params.id as string, status);
    res.json({ idea });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || "not found" });
  }
});

router.post("/reviews/tick", async (_req: Request, res: Response) => {
  try {
    await scanProjects();
    const result = await enqueueAllEligible("cron");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get("/reviews/runs", async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const runs = await tailRuns(limit);
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

export default router;
