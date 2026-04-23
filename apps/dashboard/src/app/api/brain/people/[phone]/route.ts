import { NextResponse } from "next/server";
import { getBrainPerson, updateBrainPerson } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    await requireAuthApi();
    const { phone } = await params;
    const person = await getBrainPerson(phone);
    if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(person);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ phone: string }> },
) {
  try {
    await requireAuthApi();
    const { phone } = await params;
    const body = await request.json();
    const person = await updateBrainPerson(phone, body);
    return NextResponse.json(person);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
