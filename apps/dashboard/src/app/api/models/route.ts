import { NextResponse } from "next/server";
import { getModelsCatalog } from "@/lib/agent-models-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    return NextResponse.json(await getModelsCatalog());
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
