import './globals.css';
import { Providers } from './providers';
import { ClientErrorLogger } from '@/components/ClientErrorLogger';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

export const metadata = {
  title: 'DevHub – Gestión Personal',
  description: 'Tu espacio central para proyectos, tareas y cronología personal con IA integrada',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
};

export const viewport = {
  themeColor: '#0d0d0d',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClientErrorLogger />
        <AppErrorBoundary>
          <Providers>{children}</Providers>
        </AppErrorBoundary>
      </body>
    </html>
  );
}
