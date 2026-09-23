import { NextResponse } from "next/server";

export async function GET() {
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;
  const auth = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : undefined;

  try {
    const response = await fetch("https://opensky-network.org/api/states/all", {
      headers: auth ? { Authorization: auth } : {},
      next: { revalidate: 30 },
    });

    if (!response.ok) {
      return NextResponse.json({ aircraft: [], error: "OpenSky source unavailable" }, { status: 200 });
    }

    const data = await response.json();
    const aircraft = (data.states || [])
      .filter((state: any[]) => Number.isFinite(state[6]) && Number.isFinite(state[5]))
      .slice(0, 1000)
      .map((state: any[]) => ({
        icao24: state[0],
        callsign: (state[1] || "Unknown").trim(),
        lng: state[5],
        lat: state[6],
        altitude: state[7] || 0,
        velocity: state[9] || 0,
        trueTrack: state[10] || 0,
      }));

    return NextResponse.json({ aircraft });
  } catch {
    return NextResponse.json({ aircraft: [], error: "Unable to load aviation data" }, { status: 200 });
  }
}
