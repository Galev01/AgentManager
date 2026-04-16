import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import type { ReviewProject, ReviewerState } from "@openclaw-manager/types";

function emptyState(): ReviewerState {
  return {
    scanRoot: config.reviewerScanRoot,
    projects: {},
    updatedAt: new Date().toISOString(),
  };
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
}

export async function readState(): Promise<ReviewerState> {
  try {
    const raw = await fs.readFile(config.reviewerStatePath, "utf8");
    const parsed = JSON.parse(raw) as ReviewerState;
    if (!parsed.projects) parsed.projects = {};
    if (!parsed.scanRoot) parsed.scanRoot = config.reviewerScanRoot;
    return parsed;
  } catch {
    return emptyState();
  }
}

async function writeStateAtomic(state: ReviewerState): Promise<void> {
  await ensureDir();
  state.updatedAt = new Date().toISOString();
  const tmp = config.reviewerStatePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.rename(tmp, config.reviewerStatePath);
}

export async function updateProject(
  id: string,
  patch: Partial<ReviewProject>
): Promise<ReviewProject> {
  const state = await readState();
  const existing = state.projects[id];
  if (!existing) throw new Error(`project not found: ${id}`);
  const next: ReviewProject = { ...existing, ...patch };
  state.projects[id] = next;
  await writeStateAtomic(state);
  return next;
}

export async function upsertProject(project: ReviewProject): Promise<void> {
  const state = await readState();
  state.projects[project.id] = project;
  await writeStateAtomic(state);
}

export async function replaceState(next: ReviewerState): Promise<void> {
  await writeStateAtomic(next);
}

export async function getProject(id: string): Promise<ReviewProject | null> {
  const state = await readState();
  return state.projects[id] ?? null;
}

export async function listProjects(): Promise<ReviewProject[]> {
  const state = await readState();
  return Object.values(state.projects);
}
