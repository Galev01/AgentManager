import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function POST(request: Request) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const result = await sendMessage(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to send message" },
      { status: 502 }
    );
  }
}
