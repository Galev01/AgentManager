import fs from "node:fs/promises";
import path from "node:path";
import type { ClaudeCodeTranscriptEvent } from "@openclaw-manager/types";

export function transcriptPathFor(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

export async function appendTranscript(
  filePath: string,
  event: ClaudeCodeTranscriptEvent
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(event) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}

export async function readTranscript(filePath: string): Promise<ClaudeCodeTranscriptEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return [];
  }
  const out: ClaudeCodeTranscriptEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return out;
}
