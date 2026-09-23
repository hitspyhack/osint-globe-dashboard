"use client";

import { useEffect, useRef, useState } from "react";
import { useGlobeData } from "@/hooks/useGlobeData";
import type { DataPoint, Webcam, SatellitePropagated } from "@/types";
import { propagateSatellites } from "@/lib/satellite-propagation";

export default function GlobeCanvas() {
  const globeEl = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [selectedCam, setSelectedCam] = useState<Webcam | null>(null);
  const [propagatedSats, setPropagatedSats] = useState<SatellitePropagated[]>([]);
  const [timelineDate, setTimelineDate] = useState<Date>(new Date());

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

  // Load and initialize globe.gl only after the container is mounted and painted.
  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;

    const initialize = async () => {
      if (!globeEl.current || globeRef.current) return;

      try {
        const imported = await import("globe.gl");
        const Globe = imported.default;
        if (cancelled || !globeEl.current || typeof Globe !== "function") return;

        animationFrame = requestAnimationFrame(() => {
          if (cancelled || !globeEl.current || globeRef.current) return;

          try {
            // globe.gl factory takes the DOM element as its first argument.
            const instance = Globe(globeEl.current)
              .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
              .backgroundColor("#020617")
              .showAtmosphere(true)
              .atmosphereColor("#38bdf8")
              .atmosphereAltitude(0.15)
              .pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

            instance.controls().autoRotate = true;
            instance.controls().autoRotateSpeed = 0.3;
            globeRef.current = instance;
            setIsReady(true);
          } catch (error) {
            console.error("Failed to initialize globe:", error);
          }
        });
      } catch (error) {
        console.error("Failed to load globe.gl:", error);
      }
    };

    initialize();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      globeRef.current?._destructor?.();
      globeRef.current = null;
    };
  }, []);

  // Propagate satellites whenever their catalog or selected timeline time changes.
  useEffect(() => {
    if (!satellites.length) {
      setPropagatedSats([]);
      return;
    }

    setPropagatedSats(
      propagateSatellites(
        satellites
          .filter((sat) => sat.tle && sat.noradId)
          .map((sat) => ({ name: sat.name, noradId: sat.noradId!, tle: sat.tle! })),
        timelineDate
      )
    );
  }, [satellites, timelineDate]);

  // Update globe points after initialization or live-data changes.
  useEffect(() => {
    const globe = globeRef.current;
    if (!isReady || !globe) return;

    const points: DataPoint[] = [
      ...(showISS && issPosition ? [issPosition] : []),
      ...(showEarthquakes ? earthquakes : []),
      ...(showWildfires ? wildfires : []),
      ...(showWebcams ? webcams.map((cam) => ({
        lat: cam.lat,
        lng: cam.lng,
        name: cam.title,
        size: 0.25,
        color: "#22d3ee",
        imageUrl: cam.imageUrl,
        embedUrl: cam.embedUrl,
      })) : []),
      ...(showVessels ? vessels.map((vessel) => ({
        lat: vessel.lat,
        lng: vessel.lng,
        name: vessel.name || vessel.mmsi,
        size: 0.2,
        color: "#fbbf24",
      })) : []),
      ...(showAircraft ? aircraft.map((plane) => ({
        lat: plane.lat,
        lng: plane.lng,
        name: plane.callsign || plane.icao24,
        size: 0.15,
        color: "#a78bfa",
        altitude: plane.altitude ? plane.altitude / 10000 : 0.1,
      })) : []),
      ...(showSatellites ? propagatedSats.map((satellite) => ({
        lat: satellite.lat,
        lng: satellite.lng,
        name: satellite.name,
        size: 0.1,
        color: "#34d399",
        altitude: satellite.altitude / 6371,
      })) : []),
    ];

    globe
      .pointsData(points)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude("altitude")
      .pointRadius("size")
      .pointsMerge(true)
      .onPointClick((point: any) => {
        if (!point.imageUrl && !point.embedUrl) return;
        setSelectedCam({
          id: point.name,
          lat: point.lat,
          lng: point.lng,
          title: point.name,
          imageUrl: point.imageUrl,
          embedUrl: point.embedUrl,
          source: "windy",
        });
      });
  }, [
    isReady,
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

  // Publish controls for the layer menu and location search.
  useEffect(() => {
    (window as any).__globeToggles = {
      globe: globeRef.current,
      setShowISS,
      setShowEarthquakes,
      setShowWildfires,
      setShowWebcams,
      setShowVessels,
      setShowAircraft,
      setShowSatellites,
      setTimelineDate,
    };
  }, [isReady]);

  return (
    <>
      <div id="globe-container" ref={globeEl} className="h-full w-full" />
      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950 text-slate-400">
          Loading globe...
        </div>
      )}
      {selectedCam && (
        <div className="absolute bottom-32 right-4 z-20 max-w-sm rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h4 className="text-sm font-semibold text-sky-400">{selectedCam.title}</h4>
            <button className="text-slate-400 hover:text-slate-200" onClick={() => setSelectedCam(null)}>
              ✕
            </button>
          </div>
          {selectedCam.embedUrl ? (
            <iframe src={selectedCam.embedUrl} className="h-40 w-full rounded" sandbox="allow-scripts allow-same-origin" />
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
