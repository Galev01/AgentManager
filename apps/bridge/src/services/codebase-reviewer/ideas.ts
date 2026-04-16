import fs from "node:fs/promises";
import { config } from "../../config.js";
import type {
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
} from "@openclaw-manager/types";

type IdeasFile = { ideas: ReviewIdea[]; updatedAt: string };

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
}

async function readFile(): Promise<IdeasFile> {
  try {
    const raw = await fs.readFile(config.reviewerIdeasPath, "utf8");
    const parsed = JSON.parse(raw) as IdeasFile;
    if (!Array.isArray(parsed.ideas)) parsed.ideas = [];
    return parsed;
  } catch {
    return { ideas: [], updatedAt: new Date().toISOString() };
  }
}

async function writeFile(file: IdeasFile): Promise<void> {
  await ensureDir();
  file.updatedAt = new Date().toISOString();
  const tmp = config.reviewerIdeasPath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  await fs.rename(tmp, config.reviewerIdeasPath);
}

export async function listIdeas(filters?: {
  projectId?: string[];
  status?: ReviewIdeaStatus[];
  impact?: ReviewIdeaImpact[];
  effort?: ReviewIdeaEffort[];
  category?: ReviewIdeaCategory[];
}): Promise<ReviewIdea[]> {
  const { ideas } = await readFile();
  return ideas.filter((idea) => {
    if (filters?.projectId?.length && !filters.projectId.includes(idea.projectId)) return false;
    if (filters?.status?.length && !filters.status.includes(idea.status)) return false;
    if (filters?.impact?.length && !filters.impact.includes(idea.impact)) return false;
    if (filters?.effort?.length && !filters.effort.includes(idea.effort)) return false;
    if (filters?.category?.length && !filters.category.includes(idea.category)) return false;
    return true;
  });
}

export async function getIdea(id: string): Promise<ReviewIdea | null> {
  const { ideas } = await readFile();
  return ideas.find((i) => i.id === id) ?? null;
}

export async function listIdeasForReport(
  projectId: string,
  reportDate: string
): Promise<ReviewIdea[]> {
  const { ideas } = await readFile();
  return ideas.filter((i) => i.projectId === projectId && i.reportDate === reportDate);
}

export async function replaceIdeasForReport(
  projectId: string,
  reportDate: string,
  next: ReviewIdea[]
): Promise<void> {
  const file = await readFile();
  file.ideas = file.ideas.filter(
    (i) => !(i.projectId === projectId && i.reportDate === reportDate)
  );
  file.ideas.push(...next);
  await writeFile(file);
}

export async function setIdeaStatus(
  id: string,
  status: ReviewIdeaStatus
): Promise<ReviewIdea> {
  const file = await readFile();
  const idea = file.ideas.find((i) => i.id === id);
  if (!idea) throw new Error(`idea not found: ${id}`);
  idea.status = status;
  idea.statusChangedAt = new Date().toISOString();
  await writeFile(file);
  return idea;
}
