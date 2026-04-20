import { NextResponse } from "next/server";
import { getGlobalBrain, updateGlobalBrain } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getGlobalBrain());
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    return NextResponse.json(await updateGlobalBrain(body));
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 502 });
  }
}
