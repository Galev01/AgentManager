import { NextResponse } from "next/server";
import { summarizeClaudeCodeSession } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requirePermissionApi("claude_code.summarize");
    const summary = await summarizeClaudeCodeSession(id);
    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof AuthFailure) return NextResponse.json({ error: error.message, missing: error.missing }, { status: error.status });
    return NextResponse.json(
      { error: (error as Error).message || "Failed to summarize session" },
      { status: 500 }
    );
  }
}
