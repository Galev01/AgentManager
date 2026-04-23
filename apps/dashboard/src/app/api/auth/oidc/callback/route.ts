import { NextResponse, type NextRequest } from "next/server";
import { bridgeOidcCallback } from "@/lib/auth/bridge-auth-client";
import { setSidCookie } from "@/lib/auth/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const fullUrl = req.nextUrl.toString();
  try {
    const r = await bridgeOidcCallback(fullUrl);
    if (r.kind === "logged_in") {
      await setSidCookie(r.sessionId, r.expiresAt);
      const returnTo = r.returnTo && r.returnTo.startsWith("/") ? r.returnTo : "/";
      return NextResponse.redirect(new URL(returnTo, req.url));
    }
    const params = new URLSearchParams({
      oidc_unlinked: "1",
      issuer: r.issuer,
      sub: r.sub,
      ...(r.email ? { email: r.email } : {}),
    });
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url));
  } catch {
    return NextResponse.redirect(new URL("/login?oidc_error=1", req.url));
  }
}
