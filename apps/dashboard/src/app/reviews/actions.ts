"use server";

import { revalidatePath } from "next/cache";
import {
  ackReviewProject,
  runReviewNow,
  scanReviewProjects,
  setReviewProjectEnabled,
  setReportTriage,
} from "@/lib/bridge-client";
import type { ReviewTriageState } from "@openclaw-manager/types";

export async function scanAction(): Promise<void> {
  await scanReviewProjects();
  revalidatePath("/reviews");
}

export async function runNowAction(id: string): Promise<void> {
  await runReviewNow(id);
  revalidatePath("/reviews");
}

export async function ackAction(id: string): Promise<void> {
  await ackReviewProject(id);
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${id}`);
}

export async function toggleEnabledAction(
  id: string,
  enabled: boolean
): Promise<void> {
  await setReviewProjectEnabled(id, enabled);
  revalidatePath("/reviews");
}

export async function setTriageAction(
  projectId: string,
  reportDate: string,
  triageState: ReviewTriageState
): Promise<void> {
  await setReportTriage(projectId, reportDate, triageState);
  revalidatePath("/reviews");
  revalidatePath("/reviews/inbox");
  revalidatePath(`/reviews/${projectId}`);
}
