"use client";

import { useState, useEffect } from "react";
import type { DataPoint, Webcam, Vessel, Aircraft, Satellite } from "@/types";

export function useGlobeData(timelineDate?: Date) {
  const [issPosition, setIssPosition] = useState<DataPoint | null>(null);
  const [earthquakes, setEarthquakes] = useState<DataPoint[]>([]);
  const [wildfires, setWildfires] = useState<DataPoint[]>([]);
  const [webcams, setWebcams] = useState<Webcam[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateParam = timelineDate ? `&date=${timelineDate.toISOString().split("T")[0]}` : "";

  // ISS with fallback
  useEffect(() => {
    const fetchISS = async () => {
      try {
        const res = await fetch("https://api.open-notify.org/iss-now.json", {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error("ISS API unavailable");
        const data = await res.json();
        if (data.iss_position) {
          setIssPosition({
            lat: parseFloat(data.iss_position.latitude),
            lng: parseFloat(data.iss_position.longitude),
            name: "ISS",
            size: 0.5,
            color: "#38bdf8",
          });
        }
      } catch (e) {
        console.warn("ISS fetch failed, using fallback:", e);
        // Fallback: approximate ISS position (random orbit)
        const fallbackLat = (Math.sin(Date.now() / 60000) * 51.6);
        const fallbackLng = ((Date.now() / 240000) % 360) - 180;
        setIssPosition({
          lat: fallbackLat,
          lng: fallbackLng,
          name: "ISS (fallback)",
          size: 0.5,
          color: "#38bdf8",
        });
      }
    };
    fetchISS();
    const interval = setInterval(fetchISS, 5000);
    return () => clearInterval(interval);
  }, []);

  // EONET (earthquakes, wildfires) - supports historical dates
  useEffect(() => {
    const fetchEONET = async () => {
      try {
        setLoading(true);
        const [eqRes, fireRes] = await Promise.all([
          fetch(`https://eonet.gsfc.nasa.gov/api/v2.1/events?category=earthquakes&days=7${dateParam}`, {
            signal: AbortSignal.timeout(10000),
          }),
          fetch(`https://eonet.gsfc.nasa.gov/api/v2.1/events?category=volcanoes&days=30${dateParam}`, {
            signal: AbortSignal.timeout(10000),
          }),
        ]);
        const eqData = await eqRes.json();
        const fireData = await fireRes.json();

        const parseEvents = (events: any[], type: "eq" | "fire") =>
          events
            .flatMap((e: any) => e.geometries || [])
            .map((g: any) => ({
              lat: g.coordinates[1],
              lng: g.coordinates[0],
              name: e.title || type,
              size: type === "eq" ? 0.3 : 0.4,
              color: type === "eq" ? "#f472b6" : "#f97316",
            }))
            .slice(0, 100);

        setEarthquakes(parseEvents(eqData.events || [], "eq"));
        setWildfires(parseEvents(fireData.events || [], "fire"));
        setError(null);
      } catch (e) {
        setError("Failed to load EONET data");
        console.error("EONET fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchEONET();
  }, [dateParam]);

  // Webcams (Windy + OSM)
  useEffect(() => {
    const fetchWebcams = async () => {
      try {
        const [windyRes, osmRes] = await Promise.all([
          fetch("/api/webcams/windy?bbox=-180,-85,180,85&limit=200"),
          fetch("/api/webcams/osm?bbox=-180,-85,180,85"),
        ]);
        const windyData = await windyRes.json();
        const osmData = await osmRes.json();
        const allWebcams = [
          ...(windyData.webcams || []),
          ...(osmData.webcams || []),
        ];
        setWebcams(allWebcams.slice(0, 300));
      } catch (e) {
        console.error("Webcam fetch error:", e);
      }
    };
    fetchWebcams();
  }, []);

  // Aviation (OpenSky)
  useEffect(() => {
    const fetchAviation = async () => {
      try {
        const res = await fetch("/api/aviation", {
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        setAircraft(data.aircraft || []);
      } catch (e) {
        console.warn("Aviation fetch failed:", e);
      }
    };
    fetchAviation();
    const interval = setInterval(fetchAviation, 30000);
    return () => clearInterval(interval);
  }, []);

  // Maritime (AIS placeholder)
  useEffect(() => {
    const fetchMaritime = async () => {
      try {
        const res = await fetch("/api/maritime");
        const data = await res.json();
        setVessels(data.vessels || []);
      } catch (e) {
        console.warn("Maritime fetch failed:", e);
      }
    };
    fetchMaritime();
  }, []);

  // Satellites (CelesTrak)
  useEffect(() => {
    const fetchSatellites = async () => {
      try {
        const [stationsRes, starlinkRes, weatherRes] = await Promise.all([
          fetch("/api/satellites?group=stations"),
          fetch("/api/satellites?group=starlink"),
          fetch("/api/satellites?group=weather"),
        ]);
        const stationsData = await stationsRes.json();
        const starlinkData = await starlinkRes.json();
        const weatherData = await weatherRes.json();
        setSatellites([
          ...(stationsData.satellites || []),
          ...(starlinkData.satellites || []).slice(0, 100),
          ...(weatherData.satellites || []),
        ]);
      } catch (e) {
        console.warn("Satellite fetch failed:", e);
      }
    };
    fetchSatellites();
  }, []);

  return {
    issPosition,
    earthquakes,
    wildfires,
    webcams,
    vessels,
    aircraft,
    satellites,
    loading,
    error,
  };
}
