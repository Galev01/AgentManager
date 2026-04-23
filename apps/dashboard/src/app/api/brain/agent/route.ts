import { NextResponse } from "next/server";
import { getGlobalBrain, updateGlobalBrain } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("brain.global.read");
    return NextResponse.json(await getGlobalBrain());
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermissionApi("brain.global.write");
    const body = await request.json();
    return NextResponse.json(await updateGlobalBrain(body));
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
