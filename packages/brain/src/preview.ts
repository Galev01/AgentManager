import type { BrainInjectionPreview, BrainPerson, GlobalBrain } from "@openclaw-manager/types";

type Chunk = BrainInjectionPreview["breakdown"][number];

function list(label: string, source: Chunk["source"], items: string[]): Chunk | null {
  if (items.length === 0) return null;
  return { source, label, text: items.map((i) => `- ${i}`).join("\n") };
}

function para(label: string, source: Chunk["source"], text: string): Chunk | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return { source, label, text: trimmed };
}

export function renderInjectionPreview(input: { brain: GlobalBrain; person?: BrainPerson }): BrainInjectionPreview {
  const chunks: Chunk[] = [];
  const push = (c: Chunk | null) => { if (c) chunks.push(c); };

  const { brain, person } = input;
  push(para("persona", "global", brain.persona));
  push(list("hardRules", "global", brain.hardRules));
  push(list("globalFacts", "global", brain.globalFacts));
  push(para("toneStyle", "global", brain.toneStyle));
  push(list("doNotSay", "global", brain.doNotSay));
  push(list("defaultGoals", "global", brain.defaultGoals));

  if (person) {
    push(para("summary", "person", person.summary));
    push(list("facts", "person", person.facts));
    push(list("preferences", "person", person.preferences));
    push(list("openThreads", "person", person.openThreads));
    if (person.cursing === true && person.curses.length > 0) {
      push({
        source: "curses",
        label: "rate",
        text: `When replying to this contact, pick one of the following lines at random ${person.cursingRate ?? 70}% of the time:\n${person.curses.map((c) => `- ${c}`).join("\n")}`,
      });
    }
  }

  const system = chunks.map((c) => c.text).join("\n\n");
  return { system, breakdown: chunks };
}
