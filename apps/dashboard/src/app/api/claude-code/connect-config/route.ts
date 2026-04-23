import { NextResponse } from "next/server";
import { getClaudeCodeConnectConfig } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("claude_code.view");
    return NextResponse.json(await getClaudeCodeConnectConfig());
  } catch (e) {
    if (e instanceof AuthFailure) return NextResponse.json({ error: e.message, missing: e.missing }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
