import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function PATCH(request: Request) {
  try {
    await requirePermissionApi("settings.write");
    const body = await request.json();
    const result = await updateSettings(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
