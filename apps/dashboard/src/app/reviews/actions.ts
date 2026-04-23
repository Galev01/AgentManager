"use server";

import { revalidatePath } from "next/cache";
import {
  ackReviewProject,
  addReviewProject,
  runReviewNow,
  scanReviewProjects,
  setReviewProjectEnabled,
  setReportTriage,
} from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { ReviewTriageState } from "@openclaw-manager/types";

export async function scanAction(): Promise<void> {
  await requirePermission("reviews.manage_projects");
  await scanReviewProjects();
  revalidatePath("/reviews");
}

export async function runNowAction(id: string): Promise<void> {
  await requirePermission("reviews.run_now");
  await runReviewNow(id);
  revalidatePath("/reviews");
}

export async function ackAction(id: string): Promise<void> {
  await requirePermission("reviews.triage");
  await ackReviewProject(id);
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${id}`);
}

export async function toggleEnabledAction(
  id: string,
  enabled: boolean
): Promise<void> {
  await requirePermission("reviews.manage_projects");
  await setReviewProjectEnabled(id, enabled);
  revalidatePath("/reviews");
}

export async function setTriageAction(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState
): Promise<void> {
  await requirePermission("reviews.triage");
  await setReportTriage(projectId, reportDate, triageState);
  revalidatePath("/reviews");
  revalidatePath("/reviews/inbox");
  revalidatePath(`/reviews/${projectId}`);
}

export async function addProjectAction(
  absolutePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("reviews.manage_projects");
  try {
    await addReviewProject(absolutePath);
    revalidatePath("/reviews");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "failed" };
  }
}
