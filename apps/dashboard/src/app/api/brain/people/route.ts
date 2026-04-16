import { NextResponse } from "next/server";
import { listBrainPeople, createBrainPerson } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const people = await listBrainPeople();
    return NextResponse.json(people);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to list people" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const person = await createBrainPerson({ phone: body.phone, name: body.name });
    return NextResponse.json(person, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create person" }, { status: 502 });
  }
}
