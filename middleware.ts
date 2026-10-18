import { NextRequest, NextResponse } from "next/server";

const CAPACITOR_ORIGIN = "capacitor://localhost";

/** CORS preflight for the bundled iOS UI calling its HTTPS Next.js API. */
export function middleware(request: NextRequest) {
  if (request.method !== "OPTIONS") return NextResponse.next();
  if (request.headers.get("origin") !== CAPACITOR_ORIGIN) return NextResponse.next();

  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": CAPACITOR_ORIGIN,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-ogd-keys",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
