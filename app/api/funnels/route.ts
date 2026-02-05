import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { embeddables, fetchFunnels } from '@/lib/integrations/embeddables';

export const dynamic = 'force-dynamic';

/**
 * GET /api/funnels
 * List all funnels with basic metrics
 */
export async function GET() {
  try {
    // First try to get funnels from database
    const dbFunnels = await prisma.funnel.findMany({
      include: {
        _count: {
          select: { steps: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (dbFunnels.length > 0) {
      // Get latest analytics for each funnel
      const funnelsWithAnalytics = await Promise.all(
        dbFunnels.map(async (funnel) => {
          const latestAnalytics = await prisma.funnelAnalytics.findFirst({
            where: { funnelId: funnel.id },
            orderBy: { date: 'desc' },
          });

          return {
            id: funnel.id,
            embeddablesId: funnel.embeddablesId,
            name: funnel.name,
            description: funnel.description,
            totalSteps: funnel.totalSteps,
            status: funnel.status,
            lastUpdated: funnel.updatedAt.toISOString(),
            metrics: latestAnalytics
              ? {
                  conversionRate: latestAnalytics.conversionRate,
                  totalStarts: latestAnalytics.totalStarts,
                  totalCompletions: latestAnalytics.totalCompletions,
                }
              : null,
          };
        })
      );

      return NextResponse.json({ funnels: funnelsWithAnalytics });
    }

    // If no funnels in DB, try fetching from Embeddables directly
    const embeddablesFunnels = await fetchFunnels();

    return NextResponse.json({
      funnels: embeddablesFunnels.map((f) => ({
        id: f.id,
        embeddablesId: f.id,
        name: f.name,
        totalSteps: f.totalSteps,
        status: 'active',
        lastUpdated: new Date().toISOString(),
        metrics: null,
      })),
      source: 'embeddables',
    });
  } catch (error) {
    console.error('[API] Error fetching funnels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch funnels', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
