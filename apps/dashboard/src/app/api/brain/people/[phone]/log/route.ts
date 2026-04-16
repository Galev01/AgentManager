import { NextResponse } from "next/server";
import { appendBrainPersonLog } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  try {
    const { entry } = await request.json();
    if (typeof entry !== "string" || !entry.trim()) {
      return NextResponse.json({ error: "entry is required" }, { status: 400 });
    }
    const person = await appendBrainPersonLog(phone, entry);
    return NextResponse.json(person, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
