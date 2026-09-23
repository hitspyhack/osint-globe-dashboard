"use client";

import { useEffect, useRef, useState } from "react";
import Globe from "globe.gl";

interface DataPoint {
  lat: number;
  lng: number;
  name?: string;
  size?: number;
  color?: string;
}

export default function GlobeCanvas() {
  const globeEl = useRef<any>(null);
  const [globe, setGlobe] = useState<any>(null);
  const [issPosition, setIssPosition] = useState<DataPoint | null>(null);
  const [earthquakes, setEarthquakes] = useState<DataPoint[]>([]);
  const [wildfires, setWildfires] = useState<DataPoint[]>([]);
  const [showISS, setShowISS] = useState(true);
  const [showEarthquakes, setShowEarthquakes] = useState(true);
  const [showWildfires, setShowWildfires] = useState(true);

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

  // Fetch NASA EONET events (earthquakes, wildfires)
  useEffect(() => {
    const fetchEONET = async () => {
      try {
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
      } catch (e) {
        console.error("EONET fetch error:", e);
      }
    };
    fetchEONET();
  }, []);

  // Initialize globe
  useEffect(() => {
    if (!globeEl.current) return;

    const g = Globe()
      .globeEl(globeEl.current)
      .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
      .backgroundColor("#020617")
      .showAtmosphere(true)
      .atmosphereColor("#38bdf8")
      .atmosphereAltitude(0.15)
      .pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

    setGlobe(g);

    return () => {
      g._destructor?.();
    };
  }, []);

  // Update data layers
  useEffect(() => {
    if (!globe) return;

    const allPoints: DataPoint[] = [
      ...(showISS && issPosition ? [issPosition] : []),
      ...(showEarthquakes ? earthquakes : []),
      ...(showWildfires ? wildfires : []),
    ];

    globe
      .pointsData(allPoints)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude(0.01)
      .pointRadius("size")
      .pointsMerge(true);
  }, [globe, issPosition, earthquakes, wildfires, showISS, showEarthquakes, showWildfires]);

  // Auto-rotate
  useEffect(() => {
    if (!globe) return;
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;
  }, [globe]);

  // Expose toggle methods for parent
  useEffect(() => {
    (window as any).__globeToggles = {
      setShowISS,
      setShowEarthquakes,
      setShowWildfires,
    };
  }, []);

  return (
    <div id="globe-container" ref={globeEl} className="h-full w-full" />
  );
}
