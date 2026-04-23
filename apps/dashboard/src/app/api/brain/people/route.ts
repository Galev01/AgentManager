import { NextResponse } from "next/server";
import { listBrainPeople, createBrainPerson } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET() {
  try {
    await requireAuthApi();
    const people = await listBrainPeople();
    return NextResponse.json(people);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed to list people" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthApi();
    const body = await request.json();
    const person = await createBrainPerson({ phone: body.phone, name: body.name });
    return NextResponse.json(person, { status: 201 });
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed to create person" }, { status: 502 });
  }
}
