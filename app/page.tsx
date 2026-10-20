"use client";

import dynamic from "next/dynamic";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dossier from "@/components/Dossier";
import HelpOverlay from "@/components/HelpOverlay";
import HudFrame from "@/components/HudFrame";
import JoystickNav from "@/components/JoystickNav";
import LayerDock from "@/components/LayerDock";
import MatrixRain from "@/components/MatrixRain";
import PowerUp from "@/components/PowerUp";
import SearchBar from "@/components/SearchBar";
import SensorBar from "@/components/SensorBar";
import SettingsPanel from "@/components/SettingsPanel";
import StartupLayerPicker from "@/components/StartupLayerPicker";
import TimelineBar from "@/components/TimelineBar";
import UniverseWidget from "@/components/UniverseWidget";
import { useGlobeData } from "@/hooks/useGlobeData";
import { registerServiceWorker } from "@/lib/registerServiceWorker";
import { boundsFromPov } from "@/lib/geo";
import { appOrigin } from "@/lib/api-url";
import { loadKeys, saveKeys } from "@/lib/keys";
import { BASEMAPS, DEFAULT_ENABLED, LAYERS, SENSORS } from "@/lib/layers";
import type { GlobeApi } from "@/components/GlobeView";
import type {
  ApiKeyMap,
  BasemapId,
  Entity,
  LayerId,
  Pov,
  ElevationStatus,
  Selection,
  SensorId,
} from "@/types";

const GlobeView = dynamic(() => import("@/components/GlobeView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-xs uppercase tracking-[0.4em] text-sky-400">
      Loading optics…
    </div>
  ),
});

const CONSOLE_STORAGE = "osint-globe.console.v2";

interface ConsoleState {
  enabled: LayerId[];
  sensor: SensorId;
  basemap: BasemapId;
  autoRotate: boolean;
  mergePoints: boolean;
  /** 3D entity shapes (jets, hulls, satellites…) instead of columns. */
  objectShapes: boolean;
  elevationEnabled: boolean;
  elevationExaggeration: number;
  /** Terrain surface opacity, 0–100. */
  elevationOpacity: number;
  showJoystick: boolean;
  /** Matrix digital-rain overlay across the console. */
  matrixRain: boolean;
}

const DEFAULT_STATE: ConsoleState = {
  enabled: DEFAULT_ENABLED,
  sensor: "standard",
  basemap: "satellite",
  autoRotate: true,
  mergePoints: false,
  objectShapes: true,
  elevationEnabled: false,
  elevationExaggeration: 30,
  elevationOpacity: 58,
  showJoystick: true,
  matrixRain: false,
};

function isLayerId(value: string): value is LayerId {
  return LAYERS.some((layer) => layer.id === value);
}

function pickRandomLayerIds(): LayerId[] {
  const pool = LAYERS.filter((layer) => layer.group !== "overlay").map((layer) => layer.id);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, 4);
}

export default function ConsolePage() {
  const [state, setState] = useState<ConsoleState>(DEFAULT_STATE);
  const [keys, setKeys] = useState<ApiKeyMap>({});
  const [live, setLive] = useState(true);
  const [simTime, setSimTime] = useState(() => new Date());
  const [speed, setSpeed] = useState(60);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pov, setPov] = useState<Pov>({ lat: 24, lng: 6, altitude: 2.4 });
  const [bbox, setBbox] = useState<string | undefined>(undefined);
  const [showLayers, setShowLayers] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPowerUp, setShowPowerUp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showStartupPicker, setShowStartupPicker] = useState(false);
  const [startupChoices, setStartupChoices] = useState<LayerId[]>([]);
  const [sharedLayers, setSharedLayers] = useState<LayerId[]>([]);
  const [elevationStatus, setElevationStatus] = useState<ElevationStatus>({ phase: "off", progress: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const apiRef = useRef<GlobeApi | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const povRef = useRef<Pov>(pov);
  povRef.current = pov;

  const { entities, statuses, satelliteCatalog, refresh } = useGlobeData({
    enabled: state.enabled,
    keys,
    simTime,
    live,
    bbox,
  });

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((current) => (current === message ? null : current)), 2600);
  }, []);

  /* ---- boot: restore console state, keys and shared links -------------- */

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) registerServiceWorker();

    try {
      const raw = window.localStorage.getItem(CONSOLE_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ConsoleState>;
        setState((prev) => ({
          ...prev,
          ...parsed,
          // A new session is deliberately clean: no feeds or terrain start on.
          enabled: [],
          elevationEnabled: false,
          elevationExaggeration: Number.isFinite(parsed.elevationExaggeration)
            ? Math.min(100, Math.max(1, Number(parsed.elevationExaggeration)))
            : prev.elevationExaggeration,
          elevationOpacity: Number.isFinite(parsed.elevationOpacity)
            ? Math.min(100, Math.max(0, Number(parsed.elevationOpacity)))
            : prev.elevationOpacity,
          showJoystick: parsed.showJoystick === undefined ? prev.showJoystick : Boolean(parsed.showJoystick),
          objectShapes:
            parsed.objectShapes === undefined ? true : Boolean(parsed.objectShapes),
          matrixRain: parsed.matrixRain === undefined ? false : Boolean(parsed.matrixRain),
        }));
      }
    } catch {
      /* ignore malformed storage */
    }

    setKeys(loadKeys());

    // Shared links restore camera/optics immediately, but feeds stay off until
    // the user confirms a choice in the startup prompt.
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) {
      const [coords, sensorPart, basemapPart, layersPart] = hash.split("/");
      const [lat, lng, altitude] = (coords ?? "").split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(altitude)) {
        setPov({ lat, lng, altitude });
      }
      if (layersPart) setSharedLayers(layersPart.split(",").filter(isLayerId));
      setState((prev) => ({
        ...prev,
        sensor: (SENSORS.find((item) => item.id === sensorPart)?.id ?? prev.sensor) as SensorId,
        basemap: (BASEMAPS.find((item) => item.id === basemapPart)?.id ?? prev.basemap) as BasemapId,
        enabled: [],
        elevationEnabled: false,
      }));
    }

    setStartupChoices(pickRandomLayerIds());
    setShowStartupPicker(true);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let startupComplete = false;
    let disposed = false;
    let splashModule: typeof import("@capacitor/splash-screen") | null = null;
    const hideSplash = () => {
      if (!splashModule || disposed) return;
      void splashModule.SplashScreen.hide().catch(() => undefined);
    };
    const onGlobeReady = () => {
      startupComplete = true;
      hideSplash();
    };
    const timeout = window.setTimeout(() => {
      startupComplete = true;
      hideSplash();
    }, 15_000);

    window.addEventListener("osint-globe-ready", onGlobeReady);
    void Promise.all([import("@capacitor/status-bar"), import("@capacitor/splash-screen")])
      .then(async ([statusBar, splash]) => {
        if (disposed) return;
        splashModule = splash;
        await Promise.allSettled([
          statusBar.StatusBar.setStyle({ style: statusBar.Style.Dark }),
          statusBar.StatusBar.setOverlaysWebView({ overlay: true }),
        ]);
        if (startupComplete) hideSplash();
      })
      .catch((error) => console.warn("Native shell setup failed:", error));

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      window.removeEventListener("osint-globe-ready", onGlobeReady);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CONSOLE_STORAGE, JSON.stringify(state));
    } catch {
      /* storage disabled */
    }
  }, [state]);

  /* ---- mission clock --------------------------------------------------- */

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setSimTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  /* ---- visible bounds for region-scoped feeds -------------------------- */

  useEffect(() => {
    const timer = setTimeout(() => {
      const bounds = boundsFromPov(povRef.current);
      setBbox(
        `${bounds.minLat.toFixed(2)},${bounds.minLng.toFixed(2)},${bounds.maxLat.toFixed(
          2
        )},${bounds.maxLng.toFixed(2)}`
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [pov]);

  /* ---- console actions ------------------------------------------------- */

  const toggleLayer = useCallback(
    (id: LayerId) => {
      setState((prev) => ({
        ...prev,
        enabled: prev.enabled.includes(id)
          ? prev.enabled.filter((layer) => layer !== id)
          : [...prev.enabled, id],
      }));

      // Viewport-scoped feeds explain themselves the moment they are enabled:
      // a green dot with zero tracks is otherwise indistinguishable from dead.
      if (id === "mapillary") {
        notify(
          keys.MAPILLARY
            ? "Street Imagery queries the current view — zoom into a city"
            : "Street Imagery needs a free Mapillary token — add one in POWER UP"
        );
      } else if (id === "webcams") {
        notify("Public Cameras query the current view — zoom in to scope the search");
      } else if (id === "terminator") {
        notify("Day/Night shades the night side and draws the terminator ring");
      }
    },
    [keys.MAPILLARY, notify]
  );

  const soloLayer = useCallback((id: LayerId) => {
    setState((prev) => ({
      ...prev,
      enabled: prev.enabled.length === 1 && prev.enabled[0] === id ? DEFAULT_ENABLED : [id],
    }));
  }, []);

  const startWithLayers = useCallback((layers: LayerId[]) => {
    setState((prev) => ({ ...prev, enabled: layers, elevationEnabled: false }));
    setShowStartupPicker(false);
    setShowLayers(true);
  }, []);

  const continueWithEmptyGlobe = useCallback(() => {
    setState((prev) => ({ ...prev, enabled: [], elevationEnabled: false }));
    setShowStartupPicker(false);
    setShowLayers(true);
  }, []);

  const restoreSharedLayers = useCallback(() => {
    if (sharedLayers.length > 0) startWithLayers(sharedLayers);
  }, [sharedLayers, startWithLayers]);

  const toggleElevation = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, elevationEnabled: enabled }));
    if (!enabled) setElevationStatus({ phase: "off", progress: 0 });
  }, []);

  const flyTo = useCallback((lat: number, lng: number, altitude = 0.6) => {
    apiRef.current?.flyTo(lat, lng, altitude, 2200);
  }, []);

  const handleGlobeReady = useCallback(() => {
    window.dispatchEvent(new Event("osint-globe-ready"));
  }, []);

  const locateMe = useCallback(async () => {
    if (locating) return;
    setLocating(true);

    try {
      let latitude: number;
      let longitude: number;

      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        let permission = await Geolocation.checkPermissions();
        if (permission.location !== "granted") {
          permission = await Geolocation.requestPermissions({ permissions: ["location"] });
        }
        if (permission.location !== "granted") throw new Error("Location permission was not granted.");

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 20_000,
          maximumAge: 60_000,
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } else {
        if (!navigator.geolocation) throw new Error("This browser does not provide location services.");
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 20_000,
            maximumAge: 60_000,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }

      flyTo(latitude, longitude, 0.45);
      notify(`Centered on ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Location is unavailable.";
      notify(message.length > 72 ? "Could not get your location" : message);
    } finally {
      setLocating(false);
    }
  }, [flyTo, locating, notify]);

  const screenshot = useCallback(() => {
    const dataUrl = apiRef.current?.screenshot();
    if (!dataUrl) {
      notify("Screenshot unavailable");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `osint-globe-${Date.now()}.png`;
    anchor.click();
    notify("Frame saved");
  }, [notify]);

  const share = useCallback(async () => {
    const current = apiRef.current?.getPov() ?? povRef.current;
    const hash = [
      `${current.lat.toFixed(3)},${current.lng.toFixed(3)},${current.altitude.toFixed(3)}`,
      state.sensor,
      state.basemap,
      state.enabled.join(","),
    ].join("/");

    const url = `${appOrigin()}${window.location.pathname}#${hash}`;
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({
          title: "OSINT Globe view",
          text: "Explore this OSINT Globe view",
          url,
          dialogTitle: "Share globe view",
        });
        notify("Share sheet opened");
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "OSINT Globe view", url });
        notify("View shared");
        return;
      }
      await navigator.clipboard.writeText(url);
      notify("View link copied");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        notify("View link copied");
      } catch {
        window.location.hash = hash;
        notify("View link in address bar");
      }
    }
  }, [notify, state.basemap, state.enabled, state.sensor]);

  const toggleLive = useCallback(() => {
    setLive((value) => {
      if (!value) setSimTime(new Date());
      return !value;
    });
  }, []);

  /* ---- keyboard -------------------------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        if (event.key === "Escape") target.blur();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const sensor = SENSORS.find((item) => item.hotkey === event.key);
      if (sensor) {
        setState((prev) => ({ ...prev, sensor: sensor.id }));
        return;
      }

      switch (event.key) {
        case "l":
        case "L":
          setShowLayers((value) => !value);
          break;
        case "t":
        case "T":
          setShowTimeline((value) => !value);
          break;
        case "/":
          event.preventDefault();
          searchRef.current?.focus();
          break;
        case "r":
        case "R":
          setState((prev) => ({ ...prev, autoRotate: !prev.autoRotate }));
          break;
        case "p":
        case "P":
          screenshot();
          break;
        case "+":
        case "=":
          apiRef.current?.zoomBy(0.6);
          break;
        case "-":
        case "_":
          apiRef.current?.zoomBy(1.6);
          break;
        case "?":
          setShowHelp((value) => !value);
          break;
        case "Escape":
          setSelection(null);
          setShowSettings(false);
          setShowPowerUp(false);
          setShowHelp(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screenshot]);

  /* ---- derived --------------------------------------------------------- */

  const entityCount = useMemo(
    () =>
      state.enabled.reduce((total, layer) => total + (entities[layer]?.length ?? 0), 0),
    [entities, state.enabled]
  );

  const onlineLayers = useMemo(
    () =>
      state.enabled.filter((layer) => {
        const status = statuses[layer];
        if (!status) return false;
        if (layer === "graticule" || layer === "terminator") return true;
        return Boolean(status.online);
      }).length,
    [state.enabled, statuses]
  );

  const selectedEntity: Entity | null = selection?.entity ?? null;

  return (
    <main className="console">
      <GlobeView
        entities={entities}
        enabled={state.enabled}
        basemap={state.basemap}
        sensor={state.sensor}
        autoRotate={state.autoRotate}
        mergePoints={state.mergePoints}
        objectShapes={state.objectShapes}
        elevationEnabled={state.elevationEnabled}
        elevationExaggeration={state.elevationExaggeration}
        elevationOpacity={state.elevationOpacity}
        onElevationStatus={setElevationStatus}
        simTime={simTime}
        selection={selection}
        satelliteCatalog={satelliteCatalog}
        onSelect={setSelection}
        onReady={handleGlobeReady}
        onPovChange={setPov}
        apiRef={apiRef}
      />

      {state.matrixRain && (
        <div className="matrix-rain-layer" aria-hidden="true">
          <MatrixRain opacity={0.14} />
        </div>
      )}

      <HudFrame
        sensor={state.sensor}
        basemap={state.basemap}
        entityCount={entityCount}
        activeLayers={state.enabled.length}
        totalLayers={LAYERS.length}
        onlineLayers={onlineLayers}
        simTime={simTime}
        live={live}
      />

      {!selectedEntity && <UniverseWidget date={simTime} />}

      {!selectedEntity && state.showJoystick && <JoystickNav apiRef={apiRef} />}

      {/* Top-left: search */}
      <div className="console-corner console-corner-tl">
        <SearchBar
          inputRef={searchRef}
          onFlyTo={(lat, lng, altitude) => flyTo(lat, lng, altitude ?? 0.35)}
        />
        <button
          className="tool-btn native-location-btn"
          onClick={() => void locateMe()}
          disabled={locating}
          title="Center globe on your current location"
          aria-label="Center globe on your current location"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="5.25" />
            <path d="M10 1.5v3M10 15.5v3M1.5 10h3m11 0h3" />
            <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {/* Top-right: console buttons */}
      <div className="console-corner console-corner-tr">
        <button
          className={`tool-btn ${showLayers ? "tool-btn-on" : ""}`}
          onClick={() => setShowLayers((value) => !value)}
        >
          LAYERS
        </button>
        <button
          className={`tool-btn ${showTimeline ? "tool-btn-on" : ""}`}
          onClick={() => setShowTimeline((value) => !value)}
        >
          CLOCK
        </button>
        <button
          className={`tool-btn ${showSettings ? "tool-btn-on" : ""}`}
          onClick={() => setShowSettings((value) => !value)}
        >
          OPTICS
        </button>
        <button className="tool-btn" onClick={() => setShowPowerUp(true)}>
          POWER UP
        </button>
        <button className="tool-btn tool-btn-icon" onClick={() => setShowHelp(true)}>
          ?
        </button>
      </div>

      {/* Bottom: sensor looks */}
      <SensorBar
        sensor={state.sensor}
        onChange={(sensor) => setState((prev) => ({ ...prev, sensor }))}
      />

      {showLayers && (
        <LayerDock
          enabled={state.enabled}
          statuses={statuses}
          onToggle={toggleLayer}
          onRefresh={(layer) => refresh(layer)}
          onSolo={soloLayer}
          onOpenPowerUp={() => setShowPowerUp(true)}
          onClose={() => setShowLayers(false)}
        />
      )}

      {selectedEntity && selection && (
        <Dossier
          selection={selection}
          onClose={() => setSelection(null)}
          onFlyTo={(lat, lng) => flyTo(lat, lng, 0.45)}
        />
      )}

      {showTimeline && (
        <TimelineBar
          simTime={simTime}
          live={live}
          speed={speed}
          onScrub={setSimTime}
          onToggleLive={toggleLive}
          onSpeed={setSpeed}
          onClose={() => setShowTimeline(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          basemap={state.basemap}
          onBasemap={(basemap) => setState((prev) => ({ ...prev, basemap }))}
          autoRotate={state.autoRotate}
          onAutoRotate={(autoRotate) => setState((prev) => ({ ...prev, autoRotate }))}
          mergePoints={state.mergePoints}
          onMergePoints={(mergePoints) => setState((prev) => ({ ...prev, mergePoints }))}
          objectShapes={state.objectShapes}
          onObjectShapes={(objectShapes) => setState((prev) => ({ ...prev, objectShapes }))}
          matrixRain={state.matrixRain}
          onMatrixRain={(matrixRain) => setState((prev) => ({ ...prev, matrixRain }))}
          elevationEnabled={state.elevationEnabled}
          onElevationEnabled={toggleElevation}
          elevationExaggeration={state.elevationExaggeration}
          onElevationExaggeration={(elevationExaggeration) =>
            setState((prev) => ({ ...prev, elevationExaggeration: Math.min(100, Math.max(1, elevationExaggeration)) }))
          }
          elevationOpacity={state.elevationOpacity}
          onElevationOpacity={(elevationOpacity) =>
            setState((prev) => ({ ...prev, elevationOpacity: Math.min(100, Math.max(0, elevationOpacity)) }))
          }
          elevationStatus={elevationStatus}
          showJoystick={state.showJoystick}
          onShowJoystick={(showJoystick) => setState((prev) => ({ ...prev, showJoystick }))}
          onShare={share}
          onScreenshot={screenshot}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showPowerUp && (
        <PowerUp
          keys={keys}
          onChange={(next) => {
            saveKeys(next);
            setKeys(next);
            notify("Keys saved — refreshing feeds");
          }}
          onClose={() => setShowPowerUp(false)}
        />
      )}

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {toast && <div className="toast">{toast}</div>}

      {showStartupPicker && startupChoices.length === 4 && (
        <StartupLayerPicker
          choices={startupChoices}
          onReroll={() => setStartupChoices(pickRandomLayerIds())}
          onStart={startWithLayers}
          onContinueEmpty={continueWithEmptyGlobe}
          sharedLayers={sharedLayers}
          onRestoreShared={restoreSharedLayers}
        />
      )}
    </main>
  );
}
