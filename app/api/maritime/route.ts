import { NextResponse } from "next/server";

// Adapter boundary for a compliant AIS provider. Most global real-time AIS feeds
// require a licence or API key; this returns an empty layer until a provider is configured.
export async function GET() {
  return NextResponse.json({
    vessels: [],
    configured: false,
    message: "Configure a licensed AIS provider to enable live vessel tracking.",
  });
}
