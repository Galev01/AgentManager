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

export async function isProject(folder: string): Promise<boolean> {
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

async function pathExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function scanProjects(): Promise<{
  added: string[];
  missing: string[];
  total: number;
}> {
  const state = await readState();
  const existing = new Map(Object.values(state.projects).map((p) => [p.path, p]));

  const roots = state.scanRoots.length
    ? state.scanRoots
    : config.reviewerScanRoots;

  const added: string[] = [];
  const seenPaths = new Set<string>();

  for (const root of roots) {
    let entries: string[] = [];
    try {
      const dirents = await fs.readdir(root, { withFileTypes: true });
      entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }

    for (const name of entries) {
      const fullPath = path.join(root, name);
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
  }

  const missing: string[] = [];
  for (const project of Object.values(state.projects)) {
    if (project.adhoc) {
      const exists = await pathExists(project.path);
      if (!exists) {
        if (!project.missing) {
          project.missing = true;
          state.projects[project.id] = project;
        }
        missing.push(project.id);
      } else if (project.missing) {
        project.missing = false;
        state.projects[project.id] = project;
      }
      continue;
    }
    if (!seenPaths.has(project.path)) {
      if (!project.missing) {
        project.missing = true;
        state.projects[project.id] = project;
      }
      missing.push(project.id);
    }
  }

  state.scanRoots = [...roots];
  await replaceState(state);
  return { added, missing, total: Object.keys(state.projects).length };
}

export async function addProjectByPath(absolutePath: string): Promise<{
  project: ReviewProject;
  created: boolean;
}> {
  if (!path.isAbsolute(absolutePath)) {
    throw new Error("path must be absolute");
  }
  const normalized = path.normalize(absolutePath);
  if (!(await pathExists(normalized))) {
    throw new Error("directory not found");
  }
  if (!(await isProject(normalized))) {
    throw new Error("not a recognized project (no .git or manifest file)");
  }
  const state = await readState();
  for (const p of Object.values(state.projects)) {
    if (p.path === normalized) {
      if (p.missing) {
        p.missing = false;
        state.projects[p.id] = p;
        await replaceState(state);
      }
      return { project: p, created: false };
    }
  }
  const name = path.basename(normalized) || "project";
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
    path: normalized,
    enabled: true,
    status: "idle",
    discoveredAt: nowIso,
    lastRunAt: null,
    lastReportPath: null,
    lastReportDate: null,
    lastAckedAt: null,
    eligibleAt: null,
    lastError: null,
    adhoc: true,
  };
  state.projects[id] = project;
  await replaceState(state);
  return { project, created: true };
}
