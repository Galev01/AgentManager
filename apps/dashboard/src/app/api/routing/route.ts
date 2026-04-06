import { NextResponse } from "next/server";
import {
  getRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
} from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rules = await getRoutingRules();
    return NextResponse.json(rules);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to get routing rules" },
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
    const rule = await createRoutingRule(body);
    return NextResponse.json(rule, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create routing rule" },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id, ...body } = await request.json();
    const rule = await updateRoutingRule(id, body);
    return NextResponse.json(rule);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update routing rule" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await request.json();
    const result = await deleteRoutingRule(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete routing rule" },
      { status: 502 }
    );
  }
}
