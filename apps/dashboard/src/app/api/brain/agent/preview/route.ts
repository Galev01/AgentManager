import { NextResponse } from "next/server";
import { getAgentPreview } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getAgentPreview());
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
