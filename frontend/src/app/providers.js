'use client';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';

export function Providers({ children }) {
  return (
    <AuthProvider>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{
          style: { background: '#161B26', border: '1px solid rgba(48,54,61,0.9)', color: '#F0F6FC' },
        }}
      />
    </AuthProvider>
  );
}
