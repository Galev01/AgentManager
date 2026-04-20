import type { GlobalBrain, GlobalBrainUpdate } from "@openclaw-manager/types";

const SECTION_ORDER = [
  "Persona",
  "Hard Rules",
  "Global Facts",
  "Tone / Style",
  "Do Not Say",
  "Default Goals",
] as const;
type SectionName = typeof SECTION_ORDER[number];

function splitFrontmatter(raw: string): { fmBlock: string; body: string; warning: string | null } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { fmBlock: "", body: normalized, warning: "no-frontmatter" };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { fmBlock: "", body: normalized, warning: "unterminated-frontmatter" };
  const fmBlock = normalized.slice(4, end);
  const afterDash = normalized.indexOf("\n", end + 4);
  const body = afterDash === -1 ? "" : normalized.slice(afterDash + 1);
  return { fmBlock, body, warning: null };
}

function parseFrontmatter(fmBlock: string): Record<string, string> {
  const fm: Record<string, string> = {};
  if (!fmBlock.trim()) return fm;
  for (const line of fmBlock.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (key) fm[key] = rest;
  }
  return fm;
}

function parseSections(body: string): Record<SectionName, string[]> {
  const sections: Record<SectionName, string[]> = {
    "Persona": [],
    "Hard Rules": [],
    "Global Facts": [],
    "Tone / Style": [],
    "Do Not Say": [],
    "Default Goals": [],
  };
  let current: SectionName | null = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      const name = m[1] as SectionName;
      if ((SECTION_ORDER as readonly string[]).includes(name)) {
        current = name;
        continue;
      }
    }
    if (current !== null) sections[current].push(line);
  }
  return sections;
}

function bulletLines(lines: string[]): string[] {
  const items: string[] = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*-\s+(.*)$/);
    if (m) items.push(m[1].trim());
  }
  return items;
}

function paragraphText(lines: string[]): string {
  return lines.join("\n").replace(/^\s+|\s+$/g, "");
}

export function parseGlobalBrain(raw: string): GlobalBrain {
  const { fmBlock, body, warning: fmWarn } = splitFrontmatter(raw);
  const fm = parseFrontmatter(fmBlock);
  const sections = parseSections(body);
  return {
    persona: paragraphText(sections["Persona"]),
    hardRules: bulletLines(sections["Hard Rules"]),
    globalFacts: bulletLines(sections["Global Facts"]),
    toneStyle: paragraphText(sections["Tone / Style"]),
    doNotSay: bulletLines(sections["Do Not Say"]),
    defaultGoals: bulletLines(sections["Default Goals"]),
    parseWarning: fmWarn,
    updatedAt: fm["updated"] || null,
  };
}

function bulletBlock(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

export function serializeGlobalBrain(brain: GlobalBrain, now: string = new Date().toISOString()): string {
  const fm: string[] = [
    "---",
    "kind: brain",
    "agent: whatsapp",
    `updated: ${now}`,
    "---",
  ];
  const sections = [
    `# Persona\n${brain.persona.trim()}`,
    `# Hard Rules\n${bulletBlock(brain.hardRules)}`,
    `# Global Facts\n${bulletBlock(brain.globalFacts)}`,
    `# Tone / Style\n${brain.toneStyle.trim()}`,
    `# Do Not Say\n${bulletBlock(brain.doNotSay)}`,
    `# Default Goals\n${bulletBlock(brain.defaultGoals)}`,
  ];
  return fm.join("\n") + "\n\n" + sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function applyGlobalUpdate(brain: GlobalBrain, update: GlobalBrainUpdate): GlobalBrain {
  return {
    ...brain,
    persona: update.persona ?? brain.persona,
    hardRules: update.hardRules ?? brain.hardRules,
    globalFacts: update.globalFacts ?? brain.globalFacts,
    toneStyle: update.toneStyle ?? brain.toneStyle,
    doNotSay: update.doNotSay ?? brain.doNotSay,
    defaultGoals: update.defaultGoals ?? brain.defaultGoals,
  };
}
