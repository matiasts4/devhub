/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: true, // Desactivado para evitar conflictos con entorno Tauri
  register: true,
  skipWaiting: true,
});

/**
 * QA-07 — Bundle Analyzer
 * Comando de análisis: ANALYZE=true npm run build
 */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://kpgeyukrsydjujqouape.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2V5dWtyc3lkanVqcW91YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjYzOTIsImV4cCI6MjA5MDIwMjM5Mn0.ytocfR5lKCgiEvdTy8-8oVr-e8lomxrG7O_JZHv7Upw",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // [QA-02] Static export eliminado — DevHub corre en Next.js Server Mode
  // Esto permite API Routes dinámicas, WebSockets (node-pty) y Middleware Edge Functions
  
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ],
      },
    ];
  },

  
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'api.qrserver.com' },
    ],
  },
  // Clean URLs for Tauri (Tauri abre http://localhost:3000, no archivos estáticos)
  trailingSlash: true,
  serverExternalPackages: ['node-pty', 'ws'],
  output: 'standalone',
  /**
   * QA-07 — Webpack Bundle Optimizations
   * Separar librerías pesadas en chunks independientes para reducir el bundle inicial.
   * Monaco Editor (~2MB), xterm.js (~500KB) y react-flow se cargan on-demand.
   */
  webpack: (config) => {
    return config;
  },
};

module.exports = withBundleAnalyzer(withPWA(nextConfig));
