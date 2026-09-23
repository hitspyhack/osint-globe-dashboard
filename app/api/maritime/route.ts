import { NextResponse } from "next/server";

/**
 * Maritime AIS Provider Adapter
 * 
 * Configure one of the following providers in .env.local:
 * 
 * 1. Spire Maritime (https://spire.com/maritime/)
 *    SPIRE_API_KEY=your_key
 *    SPIRE_API_URL=https://data-api.spire.com/maritime/v1
 * 
 * 2. MarineTraffic API (https://www.marinetraffic.com/en/data/apis)
 *    MARINETRAFFIC_API_KEY=your_key
 * 
 * 3. exactEarth (https://www.exactearth.com/)
 *    EXACTEARTH_API_KEY=your_key
 */

interface AISProvider {
  name: string;
  fetchVessels: () => Promise<any[]>;
}

const createSpireProvider = (): AISProvider | null => {
  const apiKey = process.env.SPIRE_API_KEY;
  const apiUrl = process.env.SPIRE_API_URL || "https://data-api.spire.com/maritime/v1";
  
  if (!apiKey) return null;
  
  return {
    name: "Spire",
    fetchVessels: async () => {
      try {
        const res = await fetch(`${apiUrl}/vessels`, {
          headers: { "Authorization": `Bearer ${apiKey}` },
          next: { revalidate: 30 },
        });
        if (!res.ok) throw new Error("Spire API error");
        const data = await res.json();
        return (data.vessels || []).map((v: any) => ({
          mmsi: v.mmsi,
          name: v.name || v.shipname,
          lat: v.latitude,
          lng: v.longitude,
          speed: v.speed,
          course: v.course,
          type: v.type,
        }));
      } catch (e) {
        console.error("Spire AIS error:", e);
        return [];
      }
    },
  };
};

const createMarineTrafficProvider = (): AISProvider | null => {
  const apiKey = process.env.MARINETRAFFIC_API_KEY;
  
  if (!apiKey) return null;
  
  return {
    name: "MarineTraffic",
    fetchVessels: async () => {
      try {
        const res = await fetch(
          `https://api.marinetraffic.com/api/assetshow/1/${apiKey}/xml/false/false/false/1000`,
          { next: { revalidate: 30 } }
        );
        if (!res.ok) throw new Error("MarineTraffic API error");
        const data = await res.json();
        return (data.data || []).map((v: any) => ({
          mmsi: v.MMSI,
          name: v.SHIPNAME,
          lat: parseFloat(v.LAT),
          lng: parseFloat(v.LON),
          speed: parseFloat(v.SPEED),
          course: parseFloat(v.COURSE),
          type: v.TYPE,
        }));
      } catch (e) {
        console.error("MarineTraffic AIS error:", e);
        return [];
      }
    },
  };
};

export async function GET() {
  const providers: AISProvider[] = [
    createSpireProvider(),
    createMarineTrafficProvider(),
  ].filter((p): p is AISProvider => p !== null);

  if (providers.length === 0) {
    return NextResponse.json({
      vessels: [],
      configured: false,
      message: "Configure a licensed AIS provider (Spire, MarineTraffic, or exactEarth) in .env.local",
      availableProviders: ["Spire", "MarineTraffic", "exactEarth"],
    });
  }

  // Use first available provider
  const vessels = await providers[0].fetchVessels();
  
  return NextResponse.json({
    vessels,
    configured: true,
    provider: providers[0].name,
  });
}
