import fs from "node:fs/promises";
import { config } from "../../config.js";
import type { ReviewRun } from "@openclaw-manager/types";

export async function appendRun(run: ReviewRun): Promise<void> {
  await fs.mkdir(config.reviewerStateDir, { recursive: true });
  await fs.appendFile(config.reviewerRunsPath, JSON.stringify(run) + "\n", "utf8");
}

export async function tailRuns(limit = 50): Promise<ReviewRun[]> {
  let raw: string;
  try {
    raw = await fs.readFile(config.reviewerRunsPath, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const sliced = lines.slice(-limit);
  const out: ReviewRun[] = [];
  for (const line of sliced) {
    try {
      out.push(JSON.parse(line) as ReviewRun);
    } catch {
      // skip malformed line
    }
  }
  return out.reverse(); // newest first
}
