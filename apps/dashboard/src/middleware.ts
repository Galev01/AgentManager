import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SID_COOKIE = "ocm_sid";

const PUBLIC_PATHS = new Set([
  "/login",
  "/bootstrap",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const sid = request.cookies.get(SID_COOKIE)?.value;
  if (!sid) {
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    const target = forwardedHost
      ? new URL(`${forwardedProto}://${forwardedHost}/login`)
      : new URL("/login", request.url);
    target.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
