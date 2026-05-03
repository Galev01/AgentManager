import { NextResponse } from "next/server";
import { getRuntimeConfig, patchRuntimeConfig } from "@/lib/runtime-config-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("runtimes.view");
    return NextResponse.json(await getRuntimeConfig());
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePermissionApi("runtimes.config");
    const body = await req.json();
    return NextResponse.json(await patchRuntimeConfig(body));
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
