"use client";

import { useState, useEffect } from "react";
import type { DataPoint } from "@/types";

export function useGlobeData() {
  const [issPosition, setIssPosition] = useState<DataPoint | null>(null);
  const [earthquakes, setEarthquakes] = useState<DataPoint[]>([]);
  const [wildfires, setWildfires] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch ISS position
  useEffect(() => {
    const fetchISS = async () => {
      try {
        const res = await fetch("https://api.open-notify.org/iss-now.json");
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
        console.error("ISS fetch error:", e);
      }
    };
    fetchISS();
    const interval = setInterval(fetchISS, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch NASA EONET events
  useEffect(() => {
    const fetchEONET = async () => {
      try {
        setLoading(true);
        const [eqRes, fireRes] = await Promise.all([
          fetch("https://eonet.gsfc.nasa.gov/api/v2.1/events?category=earthquakes&days=7"),
          fetch("https://eonet.gsfc.nasa.gov/api/v2.1/events?category=volcanoes&days=30"),
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
  }, []);

  return {
    issPosition,
    earthquakes,
    wildfires,
    loading,
    error,
  };
}
