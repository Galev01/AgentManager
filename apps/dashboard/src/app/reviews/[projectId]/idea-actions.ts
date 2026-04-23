"use server";

import { revalidatePath } from "next/cache";
import { setReviewIdeaStatus } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { ReviewIdeaStatus } from "@openclaw-manager/types";

export async function setIdeaStatusAction(
  projectId: string,
  ideaId: string,
  status: ReviewIdeaStatus
): Promise<void> {
  await requirePermission("reviews.triage");
  await setReviewIdeaStatus(ideaId, status);
  revalidatePath(`/reviews/${projectId}`);
  revalidatePath("/reviews/ideas");
}
