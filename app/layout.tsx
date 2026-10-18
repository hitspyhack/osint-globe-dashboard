import type { Metadata, Viewport } from "next";
import "./globals.css";

const DESCRIPTION =
  "Live OSINT globe console — aircraft, military traffic, vessels, satellites, earthquakes, wildfires, cameras, radio and launches on a 3D globe with sensor looks and a tactical HUD.";

export const metadata: Metadata = {
  title: "OSINT Globe — Godseye Console",
  description: DESCRIPTION,
  manifest: "/manifest.json",
  applicationName: "OSINT Globe",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OSINT Globe",
  },
  openGraph: {
    title: "OSINT Globe — Godseye Console",
    description: DESCRIPTION,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className="antialiased bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
