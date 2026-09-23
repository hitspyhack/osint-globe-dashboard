"use client";

import { Suspense, lazy } from "react";

const GlobeCanvas = lazy(() => import("@/components/GlobeCanvas"));
const BottomMenu = lazy(() => import("@/components/BottomMenu"));

export default function HomePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-400">Loading globe...</div>}>
        <GlobeCanvas />
      </Suspense>
      <BottomMenu />
    </main>
  );
}
