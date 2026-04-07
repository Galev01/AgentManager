import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { callGatewayMethod } from "@/lib/bridge-client";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Use a lightweight gateway call to check if OpenClaw is reachable
    await callGatewayMethod("models.list", {});
    return NextResponse.json({ status: "online" });
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}
