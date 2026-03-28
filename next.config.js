/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

const nextConfig = {
  // Static export for Tauri packaging
  // Removed output: 'export' to allow dynamic Next.js server rendering (PTY WebSocket)
  // Tauri serves files from a local server; disable image optimization (incompatible with static export)
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'api.qrserver.com' },
    ],
  },
  // Clean URLs for Tauri
  trailingSlash: true,
  experimental: {
    serverComponentsExternalPackages: ['node-pty', 'ws'],
  },
};

module.exports = withPWA(nextConfig);
