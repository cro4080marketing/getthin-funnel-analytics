import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const apiKey = process.env.EMBEDDABLES_API_KEY;
    const projectId = 'pr_WU28KvQa9qZ4BOuW';
    const flowId = 'flow_7bfa54903je6718b61aj2a48';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 500 }
      );
    }

    // Fetch page views from Embeddables
    const response = await fetch(
      `https://api.embeddables.com/projects/${projectId}/entries-page-views?limit=100`,
      {
        headers: {
          'X-Api-Key': apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Embeddables API error: ${response.statusText}`);
    }

    const data = await response.json();

    return NextResponse.json({ 
      success: true,
      totalEntries: data.length,
      sample: data.slice(0, 3) // Return first 3 as sample
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync data', details: error.message },
      { status: 500 }
    );
  }
}
