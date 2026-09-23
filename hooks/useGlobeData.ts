"use client";

import { useState, useEffect } from "react";
import type { DataPoint, Webcam, Vessel, Aircraft, Satellite } from "@/types";

export function useGlobeData() {
  const [issPosition, setIssPosition] = useState<DataPoint | null>(null);
  const [earthquakes, setEarthquakes] = useState<DataPoint[]>([]);
  const [wildfires, setWildfires] = useState<DataPoint[]>([]);
  const [webcams, setWebcams] = useState<Webcam[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ISS
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

  // EONET (earthquakes, wildfires)
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
        const res = await fetch("/api/aviation");
        const data = await res.json();
        setAircraft(data.aircraft || []);
      } catch (e) {
        console.error("Aviation fetch error:", e);
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
        console.error("Maritime fetch error:", e);
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
        console.error("Satellite fetch error:", e);
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
