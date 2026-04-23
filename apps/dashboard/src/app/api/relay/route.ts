import { NextResponse } from "next/server";
import {
  getRelayRecipients,
  addRelayRecipient,
  removeRelayRecipient,
  toggleRelayRecipient,
} from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requirePermissionApi("relay.view");
    const recipients = await getRelayRecipients();
    return NextResponse.json(recipients);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to get relay recipients" },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionApi("relay.manage");
    const body = await request.json();
    const recipient = await addRelayRecipient(body);
    return NextResponse.json(recipient, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to add relay recipient" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermissionApi("relay.manage");
    const { id } = await request.json();
    const result = await removeRelayRecipient(id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to remove relay recipient" },
      { status: 502 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermissionApi("relay.manage");
    const { id, enabled } = await request.json();
    const recipient = await toggleRelayRecipient(id, enabled);
    return NextResponse.json(recipient);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to toggle relay recipient" },
      { status: 502 }
    );
  }
}
