import type { ReviewIdea, ReviewSeverity } from "@openclaw-manager/types";

export function deriveSeverity(ideas: ReviewIdea[]): ReviewSeverity {
  const highCount = ideas.filter((i) => i.impact === "high").length;
  if (highCount >= 3) return "critical";
  if (highCount >= 1) return "high";
  if (ideas.some((i) => i.impact === "medium")) return "medium";
  if (ideas.length > 0) return "low";
  return "info";
}
