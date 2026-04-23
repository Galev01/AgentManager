import { NextResponse } from "next/server";
import { appendBrainPersonLog } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    await requirePermissionApi("brain.people.write");
    const { phone } = await params;
    const { entry } = await request.json();
    if (typeof entry !== "string" || !entry.trim()) {
      return NextResponse.json({ error: "entry is required" }, { status: 400 });
    }
    const person = await appendBrainPersonLog(phone, entry);
    return NextResponse.json(person, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
