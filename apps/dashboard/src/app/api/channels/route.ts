import { NextResponse } from "next/server";
import { getChannels, logoutChannel } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const channels = await getChannels();
    return NextResponse.json(channels);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to list channels" },
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
    const { name, action } = await request.json();
    if (action === "logout") {
      const result = await logoutChannel(name);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to perform channel action" },
      { status: 502 }
    );
  }
}
