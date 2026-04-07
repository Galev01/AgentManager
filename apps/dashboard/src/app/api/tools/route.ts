import { NextResponse } from "next/server";
import {
  getToolsCatalog,
  getEffectiveTools,
  getSkills,
  installSkill,
} from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? "catalog";
  try {
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
    return NextResponse.json(
      { error: err.message || "Failed to fetch tools" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (body.action === "install" && body.name) {
      const result = await installSkill(body.name);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to perform action" },
      { status: 502 }
    );
  }
}
