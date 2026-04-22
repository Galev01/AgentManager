import { NextResponse } from "next/server";
import { listActiveYoutubeRebuilds } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await listActiveYoutubeRebuilds();
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load active rebuilds" },
      { status: 502 }
    );
  }
}
