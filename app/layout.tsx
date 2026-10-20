import type { Metadata, Viewport } from "next";
import "./globals.css";

const DESCRIPTION =
  "All-Seeing Eye — a Matrix-styled live OSINT console: aircraft, military traffic, vessels, satellites, earthquakes, wildfires, cameras, radio and launches on a 3D globe with sensor looks, day/night shading and entity shapes.";

export const metadata: Metadata = {
  title: "All-Seeing Eye — Global OSINT Console",
  description: DESCRIPTION,
  manifest: "/manifest.json",
  applicationName: "All-Seeing Eye",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "All-Seeing Eye",
  },
  openGraph: {
    title: "All-Seeing Eye — Global OSINT Console",
    description: DESCRIPTION,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#010803",
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
      <body className="antialiased bg-[#010803] text-[#d6ffe2]">{children}</body>
    </html>
  );
}
