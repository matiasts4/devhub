/**
 * QA-07 — Bundle Analyzer
 * Comando de análisis: ANALYZE=true npm run build
 */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://kpgeyukrsydjujqouape.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2V5dWtyc3lkanVqcW91YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjYzOTIsImV4cCI6MjA5MDIwMjM5Mn0.ytocfR5lKCgiEvdTy8-8oVr-e8lomxrG7O_JZHv7Upw',
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: 'https', hostname: 'api.qrserver.com' }],
  },
  // Tauri serves from Next standalone; keep slash behavior neutral
  // to avoid double-slash redirects that break the proxy rewrite chain.
  trailingSlash: false,
  async rewrites() {
    // HashRouter SPA paths accidentally requested without # must still serve the shell.
    return {
      beforeFiles: [
        { source: '/hub', destination: '/' },
        { source: '/project/:path*', destination: '/' },
      ],
    };
  },
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  serverExternalPackages: ['node-pty', 'ws', 'better-sqlite3'],
  transpilePackages: ['react-konva', 'konva'],
  output: 'standalone',
};

module.exports = withBundleAnalyzer(nextConfig);
