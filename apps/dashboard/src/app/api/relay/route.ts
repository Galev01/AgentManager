import { NextResponse } from "next/server";
import {
  getRelayRecipients,
  addRelayRecipient,
  removeRelayRecipient,
  toggleRelayRecipient,
} from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const recipients = await getRelayRecipients();
    return NextResponse.json(recipients);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to get relay recipients" },
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
    const recipient = await addRelayRecipient(body);
    return NextResponse.json(recipient, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to add relay recipient" },
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
    const result = await removeRelayRecipient(id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to remove relay recipient" },
      { status: 502 }
    );
  }
}

export async function PATCH(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id, enabled } = await request.json();
    const recipient = await toggleRelayRecipient(id, enabled);
    return NextResponse.json(recipient);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to toggle relay recipient" },
      { status: 502 }
    );
  }
}
