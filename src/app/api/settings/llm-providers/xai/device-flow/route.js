import { NextResponse } from 'next/server';
import { startXaiDeviceFlow } from '@/lib/xai-oauth';

/**
 * POST /api/settings/llm-providers/xai/device-flow
 * Starts SuperGrok / X Premium+ device-code OAuth (same client as OpenCode).
 *
 * Returns: { user_code, verification_uri, verification_uri_complete?, device_code, interval, expires_in }
 */
export async function POST() {
  try {
    const data = await startXaiDeviceFlow();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
