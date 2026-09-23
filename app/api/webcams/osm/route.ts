import { NextRequest, NextResponse } from "next/server";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get("bbox") || "-180,-85,180,85";
  const [west, south, east, north] = bbox.split(",").map(Number);
  const query = `[out:json][timeout:25];(node["webcam"](${south},${west},${north},${east});node["contact:webcam"](${south},${west},${north},${east}););out tags center 250;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        next: { revalidate: 600 },
      });
      if (!response.ok) continue;
      const data = await response.json();
      const webcams = (data.elements || []).map((node: any) => ({
        id: `osm-${node.id}`,
        lat: node.lat,
        lng: node.lon,
        title: node.tags?.name || node.tags?.description || "OSM webcam",
        imageUrl: node.tags?.image,
        embedUrl: node.tags?.["contact:webcam"] || node.tags?.webcam || node.tags?.website || node.tags?.url,
        source: "osm",
      })).filter((cam: any) => Number.isFinite(cam.lat) && Number.isFinite(cam.lng));
      return NextResponse.json({ webcams });
    } catch {
      continue;
    }
  }
  return NextResponse.json({ webcams: [], error: "OSM webcam sources unavailable" }, { status: 200 });
}
