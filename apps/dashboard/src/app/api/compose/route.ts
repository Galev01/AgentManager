import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/bridge-client";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  try {
    await requireAuthApi();
    const body = await request.json();
    const result = await sendMessage(body);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthFailure) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err.message || "Failed to send message" },
      { status: 502 }
    );
  }
}
