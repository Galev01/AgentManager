import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ocm_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me-in-prod";

async function verify(signed: string): Promise<boolean> {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return false;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return sig === expected;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session || !(await verify(session))) {
    // Behind a reverse proxy, request.url reflects the internal bind addr
    // (127.0.0.1:3000) and would leak into the redirect. Rebuild the URL
    // from the forwarded host/proto headers nginx sends.
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    const target = forwardedHost
      ? new URL(`${forwardedProto}://${forwardedHost}/login`)
      : new URL("/login", request.url);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
