import { NextResponse } from "next/server";
import { promoteLog } from "@/lib/bridge-client";
import { isAuthenticated } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ phone: string; index: string }> },
) {
  const authed = await isAuthenticated();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { phone, index } = await params;
  const body = await request.json().catch(() => ({}));
  const target = body.target;
  if (target !== "facts" && target !== "preferences" && target !== "openThreads") {
    return NextResponse.json({ error: "target invalid" }, { status: 400 });
  }
  try {
    const result = await promoteLog(decodeURIComponent(phone), Number(index), target);
    return NextResponse.json(result);
  } catch (err: any) {
    const msg: string = err.message || "Failed";
    if (/moved or changed/i.test(msg)) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
