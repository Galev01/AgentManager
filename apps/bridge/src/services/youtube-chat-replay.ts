import type { YoutubeChatMessageRow } from "@openclaw-manager/types";
import { distillOlderTurns } from "./youtube-chat-distill.js";

export function splitForReplay(
  rows: YoutubeChatMessageRow[],
  nVerbatim = 4
): { older: YoutubeChatMessageRow[]; verbatim: YoutubeChatMessageRow[] } {
  if (rows.length <= nVerbatim) {
    return { older: [], verbatim: [...rows] };
  }
  const verbatim = rows.slice(-nVerbatim);
  const older = rows.slice(0, rows.length - nVerbatim);
  return { older, verbatim };
}

export async function buildReplayContext(
  summaryMarkdown: string,
  rows: YoutubeChatMessageRow[]
): Promise<string> {
  const { older, verbatim } = splitForReplay(rows, 4);
  let distilled = "";
  if (older.length > 0) {
    const result = await distillOlderTurns(older);
    if (result.ok) distilled = result.paragraph;
    // result.ok === false → omit "Earlier conversation" entirely; fall back
    // to summary + verbatim only. Never block chat restore.
  }
  const parts: string[] = [];
  parts.push("Video summary:\n" + summaryMarkdown);
  if (distilled) parts.push("Earlier conversation (condensed):\n" + distilled);
  if (verbatim.length > 0) {
    parts.push(
      "Recent conversation:\n" +
        verbatim.map((r) => `${r.role.toUpperCase()}: ${r.content}`).join("\n\n")
    );
  }
  return parts.join("\n\n---\n\n");
}
