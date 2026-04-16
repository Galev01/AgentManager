"use server";

import { revalidatePath } from "next/cache";
import { setReviewIdeaStatus } from "@/lib/bridge-client";
import type { ReviewIdeaStatus } from "@openclaw-manager/types";

export async function setIdeaStatusAction(
  projectId: string,
  ideaId: string,
  status: ReviewIdeaStatus
): Promise<void> {
  await setReviewIdeaStatus(ideaId, status);
  revalidatePath(`/reviews/${projectId}`);
  revalidatePath("/reviews/ideas");
}
