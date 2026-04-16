import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import type { ReviewProject } from "@openclaw-manager/types";
import { readState, replaceState } from "./state.js";

const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "pubspec.yaml",
  "Cargo.toml",
  "go.mod",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function isProject(folder: string): Promise<boolean> {
  try {
    const gitDir = path.join(folder, ".git");
    const stat = await fs.stat(gitDir);
    if (stat.isDirectory()) return true;
  } catch {
    // no .git
  }
  for (const file of MANIFEST_FILES) {
    try {
      await fs.access(path.join(folder, file));
      return true;
    } catch {
      // keep checking
    }
  }
  return false;
}

export async function scanProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  const state = await readState();
  const existing = new Map(Object.values(state.projects).map((p) => [p.path, p]));

  let entries: string[] = [];
  try {
    const dirents = await fs.readdir(config.reviewerScanRoot, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    entries = [];
  }

  const added: string[] = [];
  const seenPaths = new Set<string>();

  for (const name of entries) {
    const fullPath = path.join(config.reviewerScanRoot, name);
    if (!(await isProject(fullPath))) continue;
    seenPaths.add(fullPath);

    const prev = existing.get(fullPath);
    if (prev) {
      if (prev.missing) {
        prev.missing = false;
        state.projects[prev.id] = prev;
      }
      continue;
    }

    const baseId = slugify(name) || "project";
    let id = baseId;
    let i = 1;
    while (state.projects[id]) {
      id = `${baseId}-${i++}`;
    }
    const nowIso = new Date().toISOString();
    const project: ReviewProject = {
      id,
      name,
      path: fullPath,
      enabled: true,
      status: "idle",
      discoveredAt: nowIso,
      lastRunAt: null,
      lastReportPath: null,
      lastReportDate: null,
      lastAckedAt: null,
      eligibleAt: null,
      lastError: null,
    };
    state.projects[id] = project;
    added.push(id);
  }

  const missing: string[] = [];
  for (const project of Object.values(state.projects)) {
    if (!seenPaths.has(project.path)) {
      if (!project.missing) {
        project.missing = true;
        state.projects[project.id] = project;
      }
      missing.push(project.id);
    }
  }

  state.scanRoot = config.reviewerScanRoot;
  await replaceState(state);
  return { added, missing, total: Object.keys(state.projects).length };
}
