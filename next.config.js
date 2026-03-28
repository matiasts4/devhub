/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
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
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          // Monaco Editor chunk independiente
          monaco: {
            test: /[\\/]node_modules[\\/](@monaco-editor|monaco-editor)[\\/]/,
            name: 'monaco-editor',
            chunks: 'async',
            priority: 30,
          },
          // xterm chunk independiente
          xterm: {
            test: /[\\/]node_modules[\\/](xterm|xterm-addon)[\\/]/,
            name: 'xterm',
            chunks: 'async',
            priority: 25,
          },
          // Recharts / react-flow chunk
          charts: {
            test: /[\\/]node_modules[\\/](recharts|d3|react-flow)[\\/]/,
            name: 'charts-lib',
            chunks: 'async',
            priority: 20,
          },
          // Radix UI en un chunk compartido
          radix: {
            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            name: 'radix-ui',
            chunks: 'all',
            priority: 15,
          },
        },
      };
    }
    return config;
  },
};

module.exports = withBundleAnalyzer(withPWA(nextConfig));
