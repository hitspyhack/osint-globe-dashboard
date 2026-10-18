"use client";

import { useEffect, useState } from "react";
import { LAYER_BY_ID } from "@/lib/layers";
import { formatAltitude, formatLatLng, formatNumber } from "@/lib/geo";
import { formatCountdown, formatRelative, formatUtc } from "@/lib/time";
import type { Selection } from "@/types";

interface DossierProps {
  selection: Selection | null;
  onClose: () => void;
  onFlyTo: (lat: number, lng: number) => void;
}

const NUMERIC_KEYS = new Set(["Altitude", "Depth", "Velocity", "Footprint", "Speed", "Bitrate"]);

function formatMetaValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "Observed" && typeof value === "number") return formatUtc(value);
  if (key === "NET" || key === "Window start" || key === "Window end") {
    return String(value).replace("T", " ").replace("Z", "Z");
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (NUMERIC_KEYS.has(key)) {
      return `${formatNumber(value, Math.abs(value) < 10 ? 2 : 0)}`;
    }
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  return String(value);
}

/** Right-hand dossier for the selected track. */
export default function Dossier({ selection, onClose, onFlyTo }: DossierProps) {
  const [copied, setCopied] = useState(false);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    setCopied(false);
    setAudioError(false);
  }, [selection?.entity.id]);

  if (!selection) return null;

  const { entity, layer } = selection;
  const definition = LAYER_BY_ID[layer];
  const metaEntries = Object.entries(entity.meta ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(`${entity.lat.toFixed(5)}, ${entity.lng.toFixed(5)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="panel panel-right">
      <header className="panel-header">
        <div>
          <h2 className="panel-title">TARGET</h2>
          <p className="panel-sub" style={{ color: definition?.color }}>
            {definition?.icon} {definition?.name ?? layer}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close dossier">
          ✕
        </button>
      </header>

      <div className="panel-body">
        <h3 className="dossier-title">{entity.label}</h3>
        {entity.sublabel && <p className="dossier-sub">{entity.sublabel}</p>}

        <div className="dossier-grid">
          <div className="dossier-cell">
            <span className="hud-label">POSITION</span>
            <span className="dossier-value">{formatLatLng(entity.lat, entity.lng, 4)}</span>
          </div>
          <div className="dossier-cell">
            <span className="hud-label">ALTITUDE</span>
            <span className="dossier-value">{formatAltitude(entity.altitudeKm)}</span>
          </div>
          {entity.time ? (
            <div className="dossier-cell">
              <span className="hud-label">OBSERVED</span>
              <span className="dossier-value">{formatRelative(entity.time)}</span>
            </div>
          ) : null}
          {entity.kind === "launch" && entity.time ? (
            <div className="dossier-cell">
              <span className="hud-label">COUNTDOWN</span>
              <span className="dossier-value dossier-value-accent">
                {formatCountdown(entity.time)}
              </span>
            </div>
          ) : null}
        </div>

        {entity.imageUrl && (
          <img
            src={entity.imageUrl}
            alt={entity.label}
            className="dossier-image"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}

        {entity.embedUrl && (
          <iframe
            title={entity.label}
            src={entity.embedUrl}
            className="dossier-embed"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        )}

        {entity.streamUrl && !audioError && (
          <div className="dossier-audio">
            <span className="hud-label">LIVE STREAM</span>
            <audio controls src={entity.streamUrl} onError={() => setAudioError(true)} />
          </div>
        )}

        {metaEntries.length > 0 && (
          <table className="dossier-table">
            <tbody>
              {metaEntries.map(([key, value]) => (
                <tr key={key}>
                  <th>{key}</th>
                  <td>
                    {key === "TLE" ? (
                      <pre className="dossier-tle">{String(value)}</pre>
                    ) : (
                      formatMetaValue(key, value)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="dossier-actions">
          <button className="action-btn" onClick={() => onFlyTo(entity.lat, entity.lng)}>
            CENTRE
          </button>
          <button className="action-btn" onClick={copyCoords}>
            {copied ? "COPIED" : "COPY LL"}
          </button>
          <a
            className="action-btn"
            href={`https://www.openstreetmap.org/?mlat=${entity.lat}&mlon=${entity.lng}#map=12/${entity.lat}/${entity.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            OSM
          </a>
          <a
            className="action-btn"
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${entity.lat},${entity.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            STREET
          </a>
          {entity.link && (
            <a className="action-btn" href={entity.link} target="_blank" rel="noreferrer">
              SOURCE
            </a>
          )}
        </div>

        <p className="dossier-id">{entity.id}</p>
      </div>
    </aside>
  );
}
