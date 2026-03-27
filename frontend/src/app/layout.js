import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'DevNexus AI',
  description: 'Dashboard de desarrollo colaborativo con agentes de IA',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
