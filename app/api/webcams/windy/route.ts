import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const key = process.env.WINDY_WEBCAMS_API_KEY;
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get("bbox") || "-180,-85,180,85";
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  if (!key) {
    return NextResponse.json({ webcams: [], missingKey: true });
  }

  try {
    const response = await fetch(
      `https://api.windy.com/webcams/api/v3/webcams?bbox=${bbox}&limit=${limit}`,
      {
        headers: { "x-windy-api-key": key },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ webcams: [], error: "Windy source unavailable" }, { status: 200 });
    }

    const data = await response.json();
    const webcams = (data.webcams || data || []).map((cam: any) => ({
      id: String(cam.webcamId || cam.id),
      lat: cam.location?.latitude ?? cam.latitude,
      lng: cam.location?.longitude ?? cam.longitude,
      title: cam.title || cam.location?.city || "Windy webcam",
      imageUrl: cam.image?.current?.preview || cam.images?.current?.preview,
      embedUrl: cam.player?.day?.embed || cam.player?.live?.embed,
      source: "windy",
    })).filter((cam: any) => Number.isFinite(cam.lat) && Number.isFinite(cam.lng));

    return NextResponse.json({ webcams });
  } catch {
    return NextResponse.json({ webcams: [], error: "Unable to load Windy webcams" }, { status: 200 });
  }
}
