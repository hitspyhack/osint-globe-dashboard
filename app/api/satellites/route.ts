import { NextResponse } from "next/server";

const GROUPS: Record<string, string> = {
  stations: "stations",
  starlink: "starlink",
  weather: "weather",
  noaa: "noaa",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const group = GROUPS[searchParams.get("group") || "stations"] || "stations";

  try {
    const response = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("CelesTrak unavailable");
    const satellites = await response.json();

    return NextResponse.json({
      satellites: satellites.slice(0, 250).map((sat: any) => ({
        name: sat.OBJECT_NAME,
        noradId: sat.NORAD_CAT_ID,
        tle: `${sat.TLE_LINE1}\n${sat.TLE_LINE2}`,
        epoch: sat.EPOCH,
      })),
    });
  } catch {
    return NextResponse.json({ satellites: [], error: "Unable to load satellite catalog" }, { status: 200 });
  }
}
