"use client";

import { Suspense, lazy, useState } from "react";

const GlobeCanvas = lazy(() => import("@/components/GlobeCanvas"));
const BottomMenu = lazy(() => import("@/components/BottomMenu"));

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error("Search error:", e);
    }
  };

  const handleSelect = (result: any) => {
    const toggles = (window as any).__globeToggles;
    if (toggles && toggles.globe) {
      toggles.globe.pointOfView({
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        altitude: 1.5,
      });
    }
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Search bar */}
      <div className="absolute left-4 top-4 z-20 w-80">
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 Search location..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            onFocus={() => setShowSearch(true)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 backdrop-blur focus:border-sky-500 focus:outline-none"
          />
          {showSearch && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/95 shadow-xl backdrop-blur">
              {searchResults.map((result: any) => (
                <button
                  key={result.place_id}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                  onClick={() => handleSelect(result)}
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-400">Loading globe...</div>}>
        <GlobeCanvas />
      </Suspense>
      <BottomMenu />
    </main>
  );
}
