import { envelope, failure, fetchJson } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

const ENDPOINT =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=20&mode=detailed";

interface LaunchResult {
  id?: string;
  name?: string;
  net?: string;
  window_start?: string;
  window_end?: string;
  webcast?: string;
  pad?: {
    name?: string;
    latitude?: string | number;
    longitude?: string | number;
    location?: { name?: string };
  };
  rocket?: { configuration?: { name?: string; full_name?: string } };
  mission?: { name?: string; description?: string; type?: string };
  status?: { name?: string; abbrev?: string };
  vidURLs?: Array<{ url?: string }>;
}

/** Upcoming orbital launches (Launch Library 2 — keyless, rate limited). */
export async function GET() {
  try {
    const { data, cached } = await fetchJson<{ results?: LaunchResult[] }>(ENDPOINT, {
      ttlSeconds: 900,
    });

    const items = (data.results ?? [])
      .map((launch) => {
        const lat = Number.parseFloat(String(launch.pad?.latitude));
        const lng = Number.parseFloat(String(launch.pad?.longitude));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: launch.id ?? `${lat},${lng}`,
          name: launch.name ?? "Upcoming launch",
          lat,
          lng,
          net: launch.net,
          windowStart: launch.window_start,
          windowEnd: launch.window_end,
          pad: launch.pad?.name,
          location: launch.pad?.location?.name,
          rocket: launch.rocket?.configuration?.full_name ?? launch.rocket?.configuration?.name,
          mission: launch.mission?.name,
          status: launch.status?.name,
          webcast: launch.vidURLs?.[0]?.url ?? launch.webcast,
        };
      })
      .filter((launch): launch is NonNullable<typeof launch> => launch !== null);

    return envelope({ items, count: items.length, source: "Launch Library 2", cached });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "launch schedule unavailable");
  }
}
