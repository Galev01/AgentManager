import { config } from "../../config.js";
import type { ReviewProject } from "@openclaw-manager/types";

export function isEligible(project: ReviewProject, now: Date = new Date()): boolean {
  if (!project.enabled) return false;
  if (project.missing) return false;
  if (project.status !== "idle" && project.status !== "failed") return false;
  if (project.eligibleAt && new Date(project.eligibleAt).getTime() > now.getTime()) return false;
  // If a report exists and has never been acked, project is blocked until ack.
  if (project.lastReportPath && !project.lastAckedAt) return false;
  return true;
}

export function computeEligibleAtAfterAck(now: Date = new Date()): string {
  const next = new Date(now.getTime() + config.reviewerAckCooldownMs);
  return next.toISOString();
}
