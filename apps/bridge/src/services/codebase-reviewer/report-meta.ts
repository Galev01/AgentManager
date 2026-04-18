import fs from "node:fs/promises";
import { config } from "../../config.js";
import type { ReviewReportMeta, ReviewTriageState } from "@openclaw-manager/types";

type ReportMetaFile = { entries: ReviewReportMeta[]; updatedAt: string };

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
}

async function readFile(): Promise<ReportMetaFile> {
  try {
    const raw = await fs.readFile(config.reviewerReportMetaPath, "utf8");
    const parsed = JSON.parse(raw) as ReportMetaFile;
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    return parsed;
  } catch {
    return { entries: [], updatedAt: new Date().toISOString() };
  }
}

async function writeFile(file: ReportMetaFile): Promise<void> {
  await ensureDir();
  file.updatedAt = new Date().toISOString();
  const tmp = config.reviewerReportMetaPath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  await fs.rename(tmp, config.reviewerReportMetaPath);
}

export function defaultMeta(projectId: string, reportDate: string): ReviewReportMeta {
  return {
    projectId,
    reportDate,
    triageState: "new",
    triageChangedAt: null,
    triageNote: null,
  };
}

export async function getMeta(
  projectId: string,
  reportDate: string
): Promise<ReviewReportMeta> {
  const { entries } = await readFile();
  const found = entries.find(
    (e) => e.projectId === projectId && e.reportDate === reportDate
  );
  return found ?? defaultMeta(projectId, reportDate);
}

export async function listMeta(): Promise<ReviewReportMeta[]> {
  const { entries } = await readFile();
  return entries;
}

export async function setTriage(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState,
  triageNote?: string | null
): Promise<ReviewReportMeta> {
  const file = await readFile();
  const idx = file.entries.findIndex(
    (e) => e.projectId === projectId && e.reportDate === reportDate
  );
  const now = new Date().toISOString();
  const next: ReviewReportMeta = {
    projectId,
    reportDate,
    triageState,
    triageChangedAt: now,
    triageNote: triageNote ?? null,
  };
  if (idx >= 0) file.entries[idx] = next;
  else file.entries.push(next);
  await writeFile(file);
  return next;
}
