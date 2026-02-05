import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const apiKey = process.env.EMBEDDABLES_API_KEY;
    const apiUrl = process.env.EMBEDDABLES_API_URL;

    if (!apiKey || !apiUrl) {
      return NextResponse.json(
        { error: 'Missing API credentials' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Sync endpoint ready',
      hasCredentials: true 
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync data' },
      { status: 500 }
    );
  }
}
