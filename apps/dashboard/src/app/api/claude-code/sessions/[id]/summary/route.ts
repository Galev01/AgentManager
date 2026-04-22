import { NextResponse } from "next/server";
import { summarizeClaudeCodeSession } from "@/lib/bridge-client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const summary = await summarizeClaudeCodeSession(id);
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to summarize session" },
      { status: 500 }
    );
  }
}
