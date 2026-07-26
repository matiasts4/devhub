import { createSessionsRouteHandler } from '@/lib/agentSessions/sessionsRouteHandler';
import { scanGrokSessions } from '@/lib/agentSessions/sessionDirScanners';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createSessionsRouteHandler({
  provider: 'grok',
  scan: scanGrokSessions,
});
