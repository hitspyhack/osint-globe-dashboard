/** @type {import('next').NextConfig} */
const capacitorExport = process.env.CAPACITOR_STATIC_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["globe.gl", "three"],
  // Capacitor packages the client UI locally; dynamic /api routes stay on the
  // deployed Next.js service and are removed from the temporary export copy.
  ...(capacitorExport ? { output: "export", images: { unoptimized: true } } : {}),
  // Allow the sandboxed preview origin to talk to the dev server.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost"],
};

export default nextConfig;
