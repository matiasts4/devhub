import { NextResponse } from 'next/server';
import { getAvailableProfiles } from '@/utils/geminiProfiles';

export async function GET() {
  try {
    let profiles = getAvailableProfiles();

    // Hardcode default profiles if none exist to make the UI look good
    if (profiles.length === 0) {
      profiles = ['default', 'dev', 'code'];
    }

    return NextResponse.json({
      success: true,
      profiles,
    });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
