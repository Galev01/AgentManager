import type { YoutubePromptPreset, YoutubePromptPresetId } from "@openclaw-manager/types";

export const PROMPT_PRESETS: Record<YoutubePromptPresetId, YoutubePromptPreset> = {
  "tldr": {
    id: "tldr",
    title: "TL;DR",
    description: "3-sentence gist.",
    summaryInstructions: "Produce only a 3-sentence summary of the video's core claim.",
    chatInstructions: "Answer in one or two sentences.",
  },
  "key-points": {
    id: "key-points",
    title: "Key points",
    description: "Structured summary with TL;DR, bullets, quotes, takeaways.",
    summaryInstructions:
      "Produce a Markdown summary with these sections:\n\n# {title}\n**Channel:** {channel}  **Duration:** {mm:ss}  **URL:** {url}\n\n## TL;DR\n## Key points\n## Notable quotes\n## Takeaways\n\nWrite in the transcript's language. No preamble.",
    chatInstructions: "Provide a clear, structured answer when length is warranted.",
  },
  "study-notes": {
    id: "study-notes",
    title: "Study notes",
    description: "Hierarchical notes ready for Obsidian.",
    summaryInstructions:
      "Produce hierarchical study notes with H2 topics and nested bullet points. Include definitions, examples, and exam-style questions at the bottom.",
    chatInstructions: "Explain as if writing study notes — definitions first, then examples.",
  },
  "tutorial-steps": {
    id: "tutorial-steps",
    title: "Tutorial steps",
    description: "Numbered how-to reconstruction.",
    summaryInstructions:
      "If the video is a tutorial, reconstruct it as numbered steps. Each step has a one-line title, then 1-3 detail lines. Include prerequisites at top.",
    chatInstructions: "Answer as step-by-step instructions when procedural.",
  },
  "critique": {
    id: "critique",
    title: "Critique",
    description: "Contrarian read with caveats.",
    summaryInstructions:
      "Produce a critical read. What does the video get right, what's shaky, what's missing? Cite timestamps. End with 'Things to fact-check'.",
    chatInstructions: "Answer with a balanced skeptical lens.",
  },
  "action-items": {
    id: "action-items",
    title: "Action items",
    description: "Bulleted what-to-do-next.",
    summaryInstructions:
      "Extract only concrete action items the viewer should do, as a bulleted checklist. No prose.",
    chatInstructions: "Answer with concrete next steps only.",
  },
  "quotes": {
    id: "quotes",
    title: "Notable quotes",
    description: "Verbatim quotes with timestamps.",
    summaryInstructions:
      "Return only verbatim quotes (up to 10) with their timestamps. One per bullet. No commentary.",
    chatInstructions: "Quote verbatim with timestamps when relevant.",
  },
};

export const CHAT_SYSTEM_PROMPT = `You answer questions about a specific YouTube video given retrieved transcript chunks and a prior summary.

Rules:
- Answer only from provided video context + retrieved transcript chunks.
- Prefer concise direct answers.
- Cite timestamps (mm:ss) when a specific moment is relevant.
- Say you're unsure when evidence is weak or missing.
- Do not invent quotes, claims, or events.
- If the question is outside the video, say so plainly.`;
