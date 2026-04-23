import { NextResponse } from "next/server";
import { getPersonPreview } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    await requirePermissionApi("brain.people.read");
    const { phone } = await params;
    return NextResponse.json(await getPersonPreview(decodeURIComponent(phone)));
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    const status = /not found/i.test(err.message || "") ? 404 : 502;
    return NextResponse.json({ error: err.message || "Failed" }, { status });
  }
}
