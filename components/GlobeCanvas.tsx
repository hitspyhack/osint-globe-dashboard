"use client";

import { useEffect, useRef, useState } from "react";
import { useGlobeData } from "@/hooks/useGlobeData";
import type { DataPoint, Webcam, Aircraft, SatellitePropagated } from "@/types";
import { propagateSatellites } from "@/lib/satellite-propagation";

export default function GlobeCanvas() {
  const globeEl = useRef<HTMLDivElement>(null);
  const [globe, setGlobe] = useState<any>(null);
  const [selectedCam, setSelectedCam] = useState<Webcam | null>(null);
  const [propagatedSats, setPropagatedSats] = useState<SatellitePropagated[]>([]);
  const [timelineDate, setTimelineDate] = useState<Date>(new Date());
  const [GlobeModule, setGlobeModule] = useState<any>();
  
  const {
    issPosition,
    earthquakes,
    wildfires,
    webcams,
    vessels,
    aircraft,
    satellites,
  } = useGlobeData();

  const [showISS, setShowISS] = useState(true);
  const [showEarthquakes, setShowEarthquakes] = useState(true);
  const [showWildfires, setShowWildfires] = useState(true);
  const [showWebcams, setShowWebcams] = useState(true);
  const [showVessels, setShowVessels] = useState(true);
  const [showAircraft, setShowAircraft] = useState(true);
  const [showSatellites, setShowSatellites] = useState(true);

  // Dynamic import globe.gl (client-side only)
  useEffect(() => {
    let isMounted = true;
    const loadGlobe = async () => {
      try {
        // globe.gl exports a default function
        const module = await import("globe.gl");
        if (isMounted) {
          // The module exports the GlobeGL function as default
          setGlobeModule(module.default || module);
        }
      } catch (e) {
        console.error("Failed to load globe.gl:", e);
      }
    };
    loadGlobe();
    return () => {
      isMounted = false;
    };
  }, []);

  // Propagate satellites in real-time
  useEffect(() => {
    if (!satellites.length) {
      setPropagatedSats([]);
      return;
    }

    const satsWithTle = satellites
      .filter((s) => s.tle && s.noradId)
      .map((s) => ({
        name: s.name,
        noradId: s.noradId!,
        tle: s.tle!,
      }));

    const propagated = propagateSatellites(satsWithTle, timelineDate);
    setPropagatedSats(propagated);
  }, [satellites, timelineDate]);

  // Initialize globe (after dynamic import)
  useEffect(() => {
    if (!GlobeModule || !globeEl.current || globe) return;

    // GlobeModule is already the function, call it directly
    const g = GlobeModule()
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
  }, [GlobeModule, globe]);

  // Update data layers
  useEffect(() => {
    if (!globe) return;

    const allPoints: DataPoint[] = [
      ...(showISS && issPosition ? [issPosition] : []),
      ...(showEarthquakes ? earthquakes : []),
      ...(showWildfires ? wildfires : []),
      ...(showWebcams
        ? webcams.map((cam) => ({
            lat: cam.lat,
            lng: cam.lng,
            name: cam.title,
            size: 0.25,
            color: "#22d3ee",
            imageUrl: cam.imageUrl,
            embedUrl: cam.embedUrl,
          }))
        : []),
      ...(showVessels
        ? vessels.map((v) => ({
            lat: v.lat,
            lng: v.lng,
            name: v.name || v.mmsi,
            size: 0.2,
            color: "#fbbf24",
          }))
        : []),
      ...(showAircraft
        ? aircraft.map((a) => ({
            lat: a.lat,
            lng: a.lng,
            name: a.callsign || a.icao24,
            size: 0.15,
            color: "#a78bfa",
            altitude: a.altitude ? a.altitude / 10000 : 0.1,
          }))
        : []),
      ...(showSatellites
        ? propagatedSats.map((s) => ({
            lat: s.lat,
            lng: s.lng,
            name: s.name,
            size: 0.1,
            color: "#34d399",
            altitude: s.altitude / 6371,
          }))
        : []),
    ];

    globe
      .pointsData(allPoints)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude("altitude")
      .pointRadius("size")
      .pointsMerge(true)
      .onPointClick((point: any) => {
        if (point.imageUrl || point.embedUrl) {
          setSelectedCam({
            id: point.name,
            lat: point.lat,
            lng: point.lng,
            title: point.name,
            imageUrl: point.imageUrl,
            embedUrl: point.embedUrl,
            source: "windy",
          });
        }
      });
  }, [
    globe,
    issPosition,
    earthquakes,
    wildfires,
    webcams,
    vessels,
    aircraft,
    propagatedSats,
    showISS,
    showEarthquakes,
    showWildfires,
    showWebcams,
    showVessels,
    showAircraft,
    showSatellites,
  ]);

  // Auto-rotate
  useEffect(() => {
    if (!globe) return;
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;
  }, [globe]);

  // Expose globe instance and toggle methods for parent
  useEffect(() => {
    (window as any).__globeToggles = {
      globe,
      setShowISS,
      setShowEarthquakes,
      setShowWildfires,
      setShowWebcams,
      setShowVessels,
      setShowAircraft,
      setShowSatellites,
      setTimelineDate,
    };
  }, [globe]);

  return (
    <>
      <div id="globe-container" ref={globeEl} className="h-full w-full" />
      {selectedCam && (
        <div className="absolute bottom-32 right-4 z-20 max-w-sm rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-start justify-between">
            <h4 className="text-sm font-semibold text-sky-400">{selectedCam.title}</h4>
            <button
              className="text-slate-400 hover:text-slate-200"
              onClick={() => setSelectedCam(null)}
            >
              ✕
            </button>
          </div>
          {selectedCam.embedUrl ? (
            <iframe
              src={selectedCam.embedUrl}
              className="h-40 w-full rounded"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : selectedCam.imageUrl ? (
            <img src={selectedCam.imageUrl} alt={selectedCam.title} className="h-40 w-full rounded object-cover" />
          ) : null}
          <div className="mt-2 text-xs text-slate-400">
            {selectedCam.lat.toFixed(4)}, {selectedCam.lng.toFixed(4)}
          </div>
        </div>
      )}
    </>
  );
}
