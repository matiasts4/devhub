'use client';

import { useClientErrorLogger } from '@/hooks/useClientErrorLogger';

export function ClientErrorLogger() {
  useClientErrorLogger();
  return null;
}
