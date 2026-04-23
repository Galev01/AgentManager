import { NextResponse } from "next/server";
import {
  getRoutingRules,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
} from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    const rules = await getRoutingRules();
    return NextResponse.json(rules);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to get routing rules" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthApi();
    const body = await request.json();
    const rule = await createRoutingRule(body);
    return NextResponse.json(rule, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to create routing rule" },
      { status: 502 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requireAuthApi();
    const { id, ...body } = await request.json();
    const rule = await updateRoutingRule(id, body);
    return NextResponse.json(rule);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to update routing rule" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAuthApi();
    const { id } = await request.json();
    const result = await deleteRoutingRule(id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to delete routing rule" },
      { status: 502 }
    );
  }
}
