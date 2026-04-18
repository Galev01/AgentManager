import { NextResponse } from "next/server";
import { submitYoutubeJobs } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
  try {
    const result = await submitYoutubeJobs(urls);
    return NextResponse.json(result, { status: 202 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to submit youtube jobs" },
      { status: 502 }
    );
  }
}
