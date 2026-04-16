import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getProject, updateProject, listProjects } from "./state.js";
import { appendRun } from "./runs.js";
import { replaceIdeasForReport } from "./ideas.js";
import { ensureGitignore } from "./gitignore.js";
import { parseReport } from "./parser.js";
import { runReview } from "./runner.js";
import { isEligible } from "./scheduler.js";
import type { ReviewRun } from "@openclaw-manager/types";

type Job = { projectId: string; trigger: "cron" | "manual" };

const queue: Job[] = [];
let current: string | null = null;
let running = false;

function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWorkerState(): { current: string | null; queue: string[] } {
  return { current, queue: queue.map((j) => j.projectId) };
}

export function enqueue(projectId: string, trigger: "cron" | "manual"): boolean {
  if (current === projectId) return false;
  if (queue.some((j) => j.projectId === projectId)) return false;
  queue.push({ projectId, trigger });
  void drain();
  return true;
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      current = job.projectId;
      await process(job);
      current = null;
    }
  } finally {
    running = false;
  }
}

async function process(job: Job): Promise<void> {
  const project = await getProject(job.projectId);
  if (!project) return;

  const runId = crypto.randomUUID();
  const startTs = Date.now();
  const reportDate = todayDate();

  await updateProject(project.id, { status: "running", lastError: null });
  const startRun: ReviewRun = {
    runId,
    projectId: project.id,
    trigger: job.trigger,
    phase: "start",
    timestamp: new Date(startTs).toISOString(),
  };
  await appendRun(startRun);

  try {
    const result = await runReview({
      projectName: project.name,
      projectPath: project.path,
      reportDate,
    });

    const reviewDir = path.join(project.path, ".openclaw-review");
    await fs.mkdir(reviewDir, { recursive: true });
    const reportPath = path.join(reviewDir, `${reportDate}.md`);
    const tmp = reportPath + ".tmp";
    await fs.writeFile(tmp, result.markdown + "\n", "utf8");
    await fs.rename(tmp, reportPath);
    await ensureGitignore(project.path);

    const parsed = parseReport(result.markdown, {
      projectId: project.id,
      projectName: project.name,
      reportDate,
    });
    await replaceIdeasForReport(project.id, reportDate, parsed.ideas);

    await updateProject(project.id, {
      status: "awaiting_ack",
      lastRunAt: new Date().toISOString(),
      lastReportPath: reportPath,
      lastReportDate: reportDate,
      lastAckedAt: null,
      eligibleAt: null,
      lastError: null,
    });

    const endRun: ReviewRun = {
      runId,
      projectId: project.id,
      trigger: job.trigger,
      phase: "end",
      timestamp: new Date().toISOString(),
      sessionId: result.sessionId,
      reportPath,
      ideasCount: parsed.ideas.length,
      durationMs: Date.now() - startTs,
    };
    await appendRun(endRun);
    for (const w of parsed.warnings) {
      await appendRun({
        runId,
        projectId: project.id,
        trigger: job.trigger,
        phase: "end",
        timestamp: new Date().toISOString(),
        error: `warning: ${w.kind} ${w.heading}`,
      });
    }
  } catch (err: any) {
    await updateProject(project.id, {
      status: "failed",
      lastError: err?.message || "unknown error",
    });
    const errorRun: ReviewRun = {
      runId,
      projectId: project.id,
      trigger: job.trigger,
      phase: "error",
      timestamp: new Date().toISOString(),
      error: err?.message || "unknown error",
      durationMs: Date.now() - startTs,
    };
    await appendRun(errorRun);
  }
}

/** Called from server startup to clean up half-done jobs from a previous crash. */
export async function repairOnStartup(): Promise<void> {
  const projects = await listProjects();
  for (const p of projects) {
    if (p.status === "running" || p.status === "queued") {
      await updateProject(p.id, {
        status: "failed",
        lastError: "interrupted by restart",
      });
    }
  }
}

/** Enqueue every eligible project. Returns the IDs enqueued and those skipped. */
export async function enqueueAllEligible(
  trigger: "cron" | "manual"
): Promise<{ enqueued: string[]; skipped: string[] }> {
  const projects = await listProjects();
  const enqueued: string[] = [];
  const skipped: string[] = [];
  for (const p of projects) {
    if (isEligible(p)) {
      if (enqueue(p.id, trigger)) enqueued.push(p.id);
      else skipped.push(p.id);
    } else {
      skipped.push(p.id);
    }
  }
  return { enqueued, skipped };
}
