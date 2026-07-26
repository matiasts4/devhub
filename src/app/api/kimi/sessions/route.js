import { createSessionsRouteHandler } from '@/lib/agentSessions/sessionsRouteHandler';
import { scanKimiSessions } from '@/lib/agentSessions/sessionDirScanners';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createSessionsRouteHandler({
  provider: 'kimi',
  scan: scanKimiSessions,
});
