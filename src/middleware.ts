import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/od-prototype") {
    const url = new URL(request.url);
    url.pathname = "/od-prototype/";
    return NextResponse.redirect(url, 307);
  }

  if (
    pathname.length > 1 &&
    pathname.endsWith("/") &&
    pathname !== "/od-prototype/"
  ) {
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
