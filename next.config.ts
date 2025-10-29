import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable React Strict Mode to prevent double-mount in dev, which conflicts with Leaflet initialization
  reactStrictMode: false,
};

export default nextConfig;
