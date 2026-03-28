'use client';
import dynamic from 'next/dynamic';

// BrowserRouter uses browser-only APIs (document, history) — disable SSR.
// This is the correct pattern for React Router SPAs in Next.js static export.
const App = dynamic(() => import('@/App'), { ssr: false });

export default function Home() {
  return <App />;
}
