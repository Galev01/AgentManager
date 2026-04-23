import { NextResponse } from "next/server";
import { listActiveYoutubeRebuilds } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    const result = await listActiveYoutubeRebuilds();
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load active rebuilds" },
      { status: 502 }
    );
  }
}
