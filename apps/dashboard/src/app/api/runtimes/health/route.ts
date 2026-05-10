import { NextResponse } from "next/server";
import { fetchRuntimeHealth } from "@/lib/runtime-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("runtimes.view");
    return NextResponse.json(await fetchRuntimeHealth());
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
