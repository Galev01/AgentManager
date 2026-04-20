export { normalizePhone, jidForPhone } from "./phone.js";
export { resolveBrainPaths, personFilePath, type BrainPaths } from "./paths.js";
export { parsePerson, serializePerson, buildInjectionText, applyUpdate } from "./schema.js";
export {
  createBrainClient,
  BrainNotConfiguredError,
  BrainPersonNotFoundError,
  type BrainClient,
} from "./people.js";
export { createBrainWatcher, type BrainWatcher, type PersonChangeEvent } from "./watcher.js";

// --- Brain marker: lets the agent append facts inside WhatsApp replies ---
//
// The agent can include `[[[BRAIN: some fact]]]` anywhere in an outgoing reply.
// The plugin strips the marker from the sent message and appends the captured
// text to the People/<phone>.md note's ## Log section.
export {
  parseGlobalBrain,
  serializeGlobalBrain,
  applyGlobalUpdate,
} from "./global-schema.js";
export {
  createGlobalBrainClient,
  type GlobalBrainClient,
} from "./global.js";
export {
  renderInjectionPreview,
} from "./preview.js";
export type { GlobalBrainChangeEvent } from "./watcher.js";

export const BRAIN_MARKER_REGEX = /\[\[\[BRAIN:\s*([\s\S]*?)\]\]\]/g;

export function extractBrainMarkers(text: string): { cleaned: string; notes: string[] } {
  if (!text) return { cleaned: "", notes: [] };
  const notes: string[] = [];
  const cleaned = text.replace(BRAIN_MARKER_REGEX, (_match, captured: string) => {
    const trimmed = captured.trim();
    if (trimmed) notes.push(trimmed);
    return "";
  });
  return {
    cleaned: cleaned.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    notes,
  };
}
