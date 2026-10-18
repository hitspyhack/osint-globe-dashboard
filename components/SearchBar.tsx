"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFirst, type FeedCandidate } from "@/lib/feeds";
import { parseCoords } from "@/lib/geo";

export interface GeocodeHit {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type?: string;
  bbox?: { south: number; north: number; west: number; east: number };
}

interface SearchBarProps {
  onFlyTo: (lat: number, lng: number, altitude?: number) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function parseHits(raw: unknown): GeocodeHit[] {
  const items = Array.isArray(raw)
    ? raw
    : ((raw as { items?: unknown[] })?.items ?? []);
  return (items as GeocodeHit[]).filter((hit) => Number.isFinite(hit.lat) && Number.isFinite(hit.lng));
}

/** Location search: Nominatim through our proxy, with a direct fallback. */
export default function SearchBar({ onFlyTo, inputRef }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) {
      setHits([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query.trim()), 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const search = async (value: string) => {
    setBusy(true);
    setError(null);

    const candidates: FeedCandidate<GeocodeHit[]>[] = [
      {
        url: `/api/geocode?q=${encodeURIComponent(value)}`,
        label: "nominatim/proxy",
        parse: (raw) =>
          parseHits(
            (raw as { items?: unknown[] })?.items ?? raw
          ),
      },
      {
        url: `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(
          value
        )}`,
        label: "nominatim/direct",
        parse: (raw) =>
          (Array.isArray(raw) ? raw : []).map((item: Record<string, any>) => ({
            id: String(item.place_id ?? `${item.lat},${item.lon}`),
            label: item.display_name,
            lat: Number.parseFloat(item.lat),
            lng: Number.parseFloat(item.lon),
            type: item.type,
          })),
      },
    ];

    try {
      const { items } = await fetchFirst(candidates, { timeoutMs: 10_000 });
      setHits(items);
      setOpen(true);
    } catch {
      setError("geocoder unreachable");
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  const commit = (hit: GeocodeHit) => {
    onFlyTo(hit.lat, hit.lng, 0.35);
    setQuery(hit.label);
    setOpen(false);
    setHits([]);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const coords = parseCoords(query);
    if (coords) {
      onFlyTo(coords.lat, coords.lng, 0.3);
      setOpen(false);
      return;
    }
    if (hits.length > 0) commit(hits[0]);
  };

  return (
    <form className="search-bar" onSubmit={submit} role="search">
      <span className="search-icon">⌕</span>
      <input
        ref={(node) => {
          localRef.current = node;
          if (inputRef) inputRef.current = node;
        }}
        className="search-input"
        value={query}
        placeholder="Search place, or 38.72, -9.14"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(hits.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        spellCheck={false}
      />
      {busy && <span className="search-busy">···</span>}

      {open && (hits.length > 0 || error) && (
        <ul className="search-results">
          {error && <li className="search-empty">{error}</li>}
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" onMouseDown={() => commit(hit)}>
                <span className="search-result-label">{hit.label}</span>
                {hit.type && <span className="search-result-type">{hit.type}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
