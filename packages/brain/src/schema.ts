import type { BrainPerson, BrainPersonStatus, BrainPersonUpdate } from "@openclaw-manager/types";

const SECTION_ORDER = ["Summary", "Facts", "Preferences", "Open Threads", "Curses", "Notes", "Log"] as const;
type SectionName = typeof SECTION_ORDER[number];

type ParsedFrontmatter = {
  fm: Record<string, unknown>;
  warning: string | null;
};

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

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

function parseInlineArray(value: string): string[] {
  const inner = value.trim().slice(1, -1);
  if (!inner.trim()) return [];
  return inner.split(",").map((item) => {
    const v = parseScalar(item);
    return typeof v === "string" ? v : String(v);
  }).filter((s) => s.length > 0);
}

function parseFrontmatter(fmBlock: string): ParsedFrontmatter {
  if (!fmBlock.trim()) return { fm: {}, warning: null };
  const fm: Record<string, unknown> = {};
  const lines = fmBlock.split("\n");
  let i = 0;
  try {
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) { i++; continue; }
      const key = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();
      if (!key) { i++; continue; }

      if (rest === "") {
        // Block list (lines starting with "- ")
        const items: string[] = [];
        let j = i + 1;
        while (j < lines.length && /^\s*-\s/.test(lines[j])) {
          items.push(lines[j].replace(/^\s*-\s*/, "").trim());
          j++;
        }
        fm[key] = items;
        i = j;
        continue;
      }
      if (rest.startsWith("[") && rest.endsWith("]")) {
        fm[key] = parseInlineArray(rest);
      } else {
        fm[key] = parseScalar(rest);
      }
      i++;
    }
    return { fm, warning: null };
  } catch {
    return { fm, warning: "frontmatter-parse-error" };
  }
}

function stringifyScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  const s = String(value);
  if (/[:#\n]/.test(s) || s !== s.trim() || /^[\d+]/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

function stringifyInlineArray(items: string[]): string {
  if (items.length === 0) return "[]";
  return `[${items.map(stringifyScalar).join(", ")}]`;
}

function stringifyFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${stringifyInlineArray(value.map(String))}`);
    } else {
      lines.push(`${key}: ${stringifyScalar(value)}`);
    }
  }
  return lines.join("\n");
}

type Sections = Record<SectionName, string[]>;

function emptySections(): Sections {
  return {
    Summary: [],
    Facts: [],
    Preferences: [],
    "Open Threads": [],
    Curses: [],
    Notes: [],
    Log: [],
  };
}

function parseSections(body: string): { sections: Sections; preamble: string } {
  const lines = body.split("\n");
  const sections = emptySections();
  let current: SectionName | null = null;
  const preambleLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const name = m[1] as SectionName;
      if ((SECTION_ORDER as readonly string[]).includes(name)) {
        current = name;
        continue;
      }
    }
    if (current === null) preambleLines.push(line);
    else sections[current].push(line);
  }
  return { sections, preamble: preambleLines.join("\n") };
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

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((s) => s.length > 0);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function asStatus(value: unknown): BrainPersonStatus {
  return value === "archived" || value === "blocked" ? value : "active";
}

function asBool(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1";
  }
  return false;
}

function asRate(value: unknown, fallback = 70): number {
  let n: number;
  if (typeof value === "number" && Number.isFinite(value)) n = value;
  else if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) n = Number(value);
  else return fallback;
  n = Math.round(n);
  if (n < 0) n = 0;
  if (n > 100) n = 100;
  return n;
}

export function parsePerson(phone: string, raw: string): BrainPerson {
  const { fmBlock, body, warning: fmWarn } = splitFrontmatter(raw);
  const { fm, warning: parseWarn } = parseFrontmatter(fmBlock);
  const { sections } = parseSections(body);

  return {
    phone,
    jid: fm.jid == null ? null : asString(fm.jid),
    name: asString(fm.name, phone),
    aliases: asStringArray(fm.aliases),
    tags: asStringArray(fm.tags),
    relationship: fm.relationship == null ? null : asString(fm.relationship),
    language: fm.language == null ? null : asString(fm.language),
    status: asStatus(fm.status),
    created: fm.created == null ? null : asString(fm.created),
    lastSeen: fm.last_seen == null ? null : asString(fm.last_seen),
    summary: paragraphText(sections.Summary),
    facts: bulletLines(sections.Facts),
    preferences: bulletLines(sections.Preferences),
    openThreads: bulletLines(sections["Open Threads"]),
    notes: paragraphText(sections.Notes),
    log: bulletLines(sections.Log),
    cursing: asBool(fm.cursing),
    cursingRate: asRate(fm.cursing_rate),
    curses: bulletLines(sections.Curses),
    raw,
    parseWarning: fmWarn || parseWarn,
  };
}

function emitSection(name: SectionName, content: string): string {
  return `## ${name}\n${content}`.replace(/\s+$/u, "") + "\n";
}

function bulletBlock(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

function paragraphBlock(text: string): string {
  return text.trim();
}

export function serializePerson(person: BrainPerson): string {
  const fm: Record<string, unknown> = {
    name: person.name,
    aliases: person.aliases,
    phone: person.phone,
    jid: person.jid ?? null,
    tags: person.tags,
    created: person.created ?? null,
    last_seen: person.lastSeen ?? null,
    relationship: person.relationship ?? null,
    language: person.language ?? null,
    status: person.status,
    cursing: person.cursing === true,
    cursing_rate: typeof person.cursingRate === "number" ? asRate(person.cursingRate) : 70,
  };
  const fmText = stringifyFrontmatter(fm);
  const title = `# ${person.name || person.phone}`;

  const parts: string[] = [
    "---",
    fmText,
    "---",
    "",
    title,
    "",
    emitSection("Summary", paragraphBlock(person.summary)),
    emitSection("Facts", bulletBlock(person.facts)),
    emitSection("Preferences", bulletBlock(person.preferences)),
    emitSection("Open Threads", bulletBlock(person.openThreads)),
    emitSection("Curses", bulletBlock(person.curses)),
    emitSection("Notes", paragraphBlock(person.notes)),
    emitSection("Log", bulletBlock(person.log)),
  ];
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// Extract only the sections the agent should see (above "## Notes"):
// Summary, Facts, Preferences, Open Threads + a frontmatter header.
export function buildInjectionText(person: BrainPerson): string {
  const header: string[] = [];
  header.push(`Person: ${person.name}`);
  header.push(`Phone: ${person.phone}`);
  if (person.language) header.push(`Preferred language: ${person.language}`);
  if (person.relationship) header.push(`Relationship: ${person.relationship}`);
  if (person.status !== "active") header.push(`Status: ${person.status}`);

  const parts: string[] = [header.join("\n")];

  if (person.summary.trim()) {
    parts.push(`Summary:\n${person.summary.trim()}`);
  }
  if (person.facts.length) {
    parts.push(`Known facts:\n${person.facts.map((f) => `- ${f}`).join("\n")}`);
  }
  if (person.preferences.length) {
    parts.push(`Preferences:\n${person.preferences.map((p) => `- ${p}`).join("\n")}`);
  }
  if (person.openThreads.length) {
    parts.push(`Open threads:\n${person.openThreads.map((t) => `- ${t}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

export function applyUpdate(person: BrainPerson, update: BrainPersonUpdate): BrainPerson {
  return {
    ...person,
    name: update.name ?? person.name,
    aliases: update.aliases ?? person.aliases,
    tags: update.tags ?? person.tags,
    relationship: update.relationship === undefined ? person.relationship : update.relationship,
    language: update.language === undefined ? person.language : update.language,
    status: update.status ?? person.status,
    summary: update.summary ?? person.summary,
    facts: update.facts ?? person.facts,
    preferences: update.preferences ?? person.preferences,
    openThreads: update.openThreads ?? person.openThreads,
    notes: update.notes ?? person.notes,
    cursing: update.cursing === undefined ? person.cursing : update.cursing,
    cursingRate: update.cursingRate === undefined ? person.cursingRate : asRate(update.cursingRate),
    curses: update.curses ?? person.curses,
  };
}
