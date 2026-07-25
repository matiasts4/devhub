import { Providers } from './providers';
import { ClientErrorLogger } from '@/components/ClientErrorLogger';
import './globals.css';

export const metadata = {
  title: 'DevHub – Gestión Personal',
  description: 'Tu espacio central para proyectos, tareas y cronología personal con IA integrada',
  manifest: '/manifest.json',
  icons: {
    // Lightweight icons — the source logo.png is 2.4 MB (1535×1535), which is
    // why the tab logo used to pop in after the whole app had loaded. These
    // are pre-resized derivatives (2–40 KB) so the favicon paints instantly.
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/logo-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/logo-180.png',
    shortcut: '/icons/logo-32.png',
  },
};

export const viewport = {
  themeColor: '#0d0d0d',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/logo-180.png" />
        {/* Startup logo: preloads the tiny shell logo so it paints with the
            very first HTML frame (the "preparing workspace…" shell in
            app/page.js renders it while the bundle boots). */}
        <link rel="preload" as="image" href="/icons/logo-64.png" />
        {/* scenery-wallpapers: start the active wallpaper download before the JS
            bundle evaluates so the image is already cached when the terminals
            render, instead of fading in after them. The URL is persisted to
            devhub:scenery:wallpaper-url by preloadActiveSceneryPrefs. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var u=localStorage.getItem('devhub:scenery:wallpaper-url');if(u&&u.indexOf('data:')!==0){var l=document.createElement('link');l.rel='preload';l.as='image';l.href=u;document.head.appendChild(l);}}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientErrorLogger />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
