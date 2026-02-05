import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { embeddables } from '@/lib/integrations/embeddables';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/funnels/:id
 * Get funnel details with analytics
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;

    // Parse date range from query params (default to last 7 days)
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : endOfDay(new Date());
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : startOfDay(subDays(endDate, 7));

    // Try to get funnel from database first
    const funnel = await prisma.funnel.findFirst({
      where: {
        OR: [{ id }, { embeddablesId: id }],
      },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    if (!funnel) {
      return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
    }

    // Get analytics for date range
    const analytics = await prisma.funnelAnalytics.findMany({
      where: {
        funnelId: funnel.id,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'desc' },
    });

    // Get step analytics
    const stepAnalytics = await prisma.stepAnalytics.findMany({
      where: {
        step: {
          funnelId: funnel.id,
        },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        step: true,
      },
      orderBy: [{ step: { stepNumber: 'asc' } }, { date: 'desc' }],
    });

    // Aggregate step metrics
    const stepMetricsMap = new Map<
      string,
      {
        stepNumber: number;
        stepName: string;
        entries: number;
        exits: number;
        conversionRate: number;
        dropOffRate: number;
        avgTimeOnStep: number;
        dataPoints: number;
      }
    >();

    for (const sa of stepAnalytics) {
      const key = sa.step.id;
      const existing = stepMetricsMap.get(key) || {
        stepNumber: sa.step.stepNumber,
        stepName: sa.step.stepName,
        entries: 0,
        exits: 0,
        conversionRate: 0,
        dropOffRate: 0,
        avgTimeOnStep: 0,
        dataPoints: 0,
      };

      existing.entries += sa.entries;
      existing.exits += sa.exits;
      existing.conversionRate += sa.conversionRate;
      existing.dropOffRate += sa.dropOffRate;
      existing.avgTimeOnStep += sa.avgTimeOnStep || 0;
      existing.dataPoints += 1;

      stepMetricsMap.set(key, existing);
    }

    // Calculate averages
    const stepMetrics = Array.from(stepMetricsMap.values())
      .map((s) => ({
        stepNumber: s.stepNumber,
        stepName: s.stepName,
        entries: s.entries,
        exits: s.exits,
        conversionRate: s.dataPoints > 0 ? s.conversionRate / s.dataPoints : 0,
        dropOffRate: s.dataPoints > 0 ? s.dropOffRate / s.dataPoints : 0,
        avgTimeOnStep: s.dataPoints > 0 ? Math.round(s.avgTimeOnStep / s.dataPoints) : 0,
      }))
      .sort((a, b) => a.stepNumber - b.stepNumber);

    // Calculate overall metrics
    const totalStarts = analytics.reduce((sum, a) => sum + a.totalStarts, 0);
    const totalCompletions = analytics.reduce((sum, a) => sum + a.totalCompletions, 0);
    const overallConversionRate = totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0;

    return NextResponse.json({
      funnel: {
        id: funnel.id,
        embeddablesId: funnel.embeddablesId,
        name: funnel.name,
        description: funnel.description,
        totalSteps: funnel.totalSteps,
        status: funnel.status,
        steps: funnel.steps.map((s) => ({
          stepNumber: s.stepNumber,
          stepName: s.stepName,
          stepKey: s.stepKey,
        })),
      },
      metrics: {
        overall: {
          totalStarts,
          totalCompletions,
          conversionRate: overallConversionRate,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
        },
        steps: stepMetrics,
        daily: analytics.map((a) => ({
          date: a.date.toISOString().split('T')[0],
          totalStarts: a.totalStarts,
          totalCompletions: a.totalCompletions,
          conversionRate: a.conversionRate,
        })),
      },
    });
  } catch (error) {
    console.error('[API] Error fetching funnel:', error);
    return NextResponse.json(
      { error: 'Failed to fetch funnel', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
