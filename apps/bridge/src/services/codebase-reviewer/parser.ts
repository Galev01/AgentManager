import type {
  ReviewIdea,
  ReviewIdeaCategory,
  ReviewIdeaEffort,
  ReviewIdeaImpact,
} from "@openclaw-manager/types";

const CATEGORY_MAP: Record<string, ReviewIdeaCategory> = {
  "new feature ideas": "new_feature",
  "improvements to existing features": "improvement",
  "ui/ux suggestions": "ui_ux",
  "technical debt / risks": "tech_debt",
};

const PROSE_HEADINGS = new Set(["executive summary", "recommended next step"]);

function normalizeHeading(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "idea"
  );
}

function parseImpact(raw: string): ReviewIdeaImpact {
  const v = raw.trim().toLowerCase();
  if (v === "low" || v === "high") return v;
  if (v === "medium" || v === "med") return "medium";
  return "medium";
}

function parseEffort(raw: string): ReviewIdeaEffort {
  const v = raw.trim().toUpperCase();
  if (v === "S" || v === "M" || v === "L") return v as ReviewIdeaEffort;
  return "M";
}

type IdeaDraft = {
  title: string;
  problem: string;
  solution: string;
  impact: ReviewIdeaImpact;
  effort: ReviewIdeaEffort;
};

function extractField(body: string, label: RegExp): string {
  const line = body.split(/\r?\n/).find((l) => label.test(l));
  if (!line) return "";
  return line.replace(label, "").trim();
}

export type ParserWarning = { kind: "unknown_category"; heading: string };

export type ParseResult = {
  ideas: ReviewIdea[];
  warnings: ParserWarning[];
};

export function parseReport(
  markdown: string,
  opts: { projectId: string; projectName: string; reportDate: string }
): ParseResult {
  const lines = markdown.split(/\r?\n/);
  const ideas: ReviewIdea[] = [];
  const warnings: ParserWarning[] = [];
  const nowIso = new Date().toISOString();

  let currentCategory: ReviewIdeaCategory | null = null;
  let currentProseSkip = false;
  let draft: IdeaDraft | null = null;
  let draftBodyLines: string[] = [];

  const flush = () => {
    if (!draft || !currentCategory) return;
    const body = draftBodyLines.join("\n");
    draft.problem = extractField(body, /^\s*[-*]\s*Problem:\s*/i) || draft.problem;
    draft.solution =
      extractField(body, /^\s*[-*]\s*(Proposed\s+)?Solution:\s*/i) || draft.solution;
    const impactLine = extractField(body, /^\s*[-*]\s*Impact:\s*/i);
    const effortLine = extractField(body, /^\s*[-*]\s*Effort:\s*/i);
    if (impactLine) draft.impact = parseImpact(impactLine);
    if (effortLine) draft.effort = parseEffort(effortLine);
    const id = `${opts.projectId}-${opts.reportDate}-${slugifyTitle(draft.title)}`;
    ideas.push({
      id,
      projectId: opts.projectId,
      projectName: opts.projectName,
      reportDate: opts.reportDate,
      category: currentCategory,
      title: draft.title,
      problem: draft.problem,
      solution: draft.solution,
      impact: draft.impact,
      effort: draft.effort,
      status: "pending",
      createdAt: nowIso,
      statusChangedAt: null,
    });
    draft = null;
    draftBodyLines = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      const key = normalizeHeading(h2[1]);
      if (PROSE_HEADINGS.has(key)) {
        currentCategory = null;
        currentProseSkip = true;
        continue;
      }
      const cat = CATEGORY_MAP[key];
      if (cat) {
        currentCategory = cat;
        currentProseSkip = false;
      } else {
        warnings.push({ kind: "unknown_category", heading: h2[1] });
        currentCategory = "improvement";
        currentProseSkip = false;
      }
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      flush();
      if (currentProseSkip || !currentCategory) continue;
      draft = {
        title: h3[1].trim(),
        problem: "",
        solution: "",
        impact: "medium",
        effort: "M",
      };
      draftBodyLines = [];
      continue;
    }
    if (draft) draftBodyLines.push(line);
  }
  flush();

  // dedupe by id (last one wins)
  const seen = new Map<string, ReviewIdea>();
  for (const idea of ideas) seen.set(idea.id, idea);
  return { ideas: [...seen.values()], warnings };
}
