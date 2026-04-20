import { NextResponse } from "next/server";
import { getPersonPreview } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  try {
    return NextResponse.json(await getPersonPreview(decodeURIComponent(phone)));
  } catch (err: any) {
    const status = /not found/i.test(err.message || "") ? 404 : 502;
    return NextResponse.json({ error: err.message || "Failed" }, { status });
  }
}
