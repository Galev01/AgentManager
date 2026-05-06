import { NextResponse } from "next/server";
import { getAgentModelsSnapshot, patchAgentModel } from "@/lib/agent-models-client";
import { requireAuthApi, requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    return NextResponse.json(await getAgentModelsSnapshot());
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requirePermissionApi("agents.manage");
    const body = (await req.json()) as { agentName?: string; modelId?: string };
    if (typeof body.agentName !== "string" || !body.agentName.trim()) {
      return NextResponse.json({ error: "agentName required" }, { status: 400 });
    }
    if (typeof body.modelId !== "string" || !body.modelId.trim()) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }
    return NextResponse.json(await patchAgentModel(body.agentName, body.modelId));
  } catch (err) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    // bridge-fetch error path: surface 502 so the UI can read the message
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
