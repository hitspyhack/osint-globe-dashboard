/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["globe.gl", "three"],
  // Allow the sandboxed preview origin to talk to the dev server.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost"],
};

export default nextConfig;
