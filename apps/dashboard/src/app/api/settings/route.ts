import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/bridge-client";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const result = await updateSettings(body);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
