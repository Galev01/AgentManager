import { NextResponse } from "next/server";
import {
  getToolsCatalog,
  getEffectiveTools,
  getSkills,
  installSkill,
} from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  try {
    await requirePermissionApi("tools.view");
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") ?? "catalog";
    if (tab === "effective") {
      const data = await getEffectiveTools();
      return NextResponse.json(data);
    }
    if (tab === "skills") {
      const data = await getSkills();
      return NextResponse.json(data);
    }
    // default: catalog
    const data = await getToolsCatalog();
    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to fetch tools" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionApi("tools.install");
    const body = await request.json();
    if (body.action === "install" && body.name) {
      const result = await installSkill(body.name);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to perform action" },
      { status: 502 }
    );
  }
}
