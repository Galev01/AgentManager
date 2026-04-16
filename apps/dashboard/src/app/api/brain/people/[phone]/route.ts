import { NextResponse } from "next/server";
import { getBrainPerson, updateBrainPerson } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  try {
    const person = await getBrainPerson(phone);
    if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(person);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone } = await params;
  try {
    const body = await request.json();
    const person = await updateBrainPerson(phone, body);
    return NextResponse.json(person);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
