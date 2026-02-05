import { NextRequest, NextResponse } from 'next/server';
import { embeddables } from '@/lib/integrations/embeddables';
import { subDays, startOfDay, endOfDay, format, eachDayOfInterval } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/funnels/analytics
 * Get real-time analytics directly from Embeddables API
 * Useful for dashboard when database hasn't been synced yet
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '500', 10);

    // Fetch entries from Embeddables
    const entries = await embeddables.getEntriesPageViews(limit);

    if (!entries || entries.length === 0) {
      return NextResponse.json({
        success: true,
        totalEntries: 0,
        metrics: {
          totalStarts: 0,
          totalCompletions: 0,
          conversionRate: 0,
          abandonmentRate: 0,
        },
        steps: [],
        trends: [],
      });
    }

    // Calculate funnel metrics
    const funnelMetrics = embeddables.calculateFunnelMetrics(entries);

    // Process step analytics
    const stepAnalytics = embeddables.processPageViewsToStepAnalytics(entries);

    // Calculate daily trends
    const endDate = endOfDay(new Date());
    const startDate = startOfDay(subDays(endDate, 30));
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    const dailyMetrics = new Map<string, { starts: number; completions: number }>();

    // Initialize all dates with zeros
    for (const date of dateRange) {
      dailyMetrics.set(format(date, 'yyyy-MM-dd'), { starts: 0, completions: 0 });
    }

    // Aggregate by date
    for (const entry of entries) {
      const dateKey = format(new Date(entry.createdAt), 'yyyy-MM-dd');
      const existing = dailyMetrics.get(dateKey);
      if (existing) {
        existing.starts++;
        if (entry.completed) {
          existing.completions++;
        }
      }
    }

    const trends = Array.from(dailyMetrics.entries())
      .map(([date, metrics]) => ({
        date,
        totalStarts: metrics.starts,
        totalCompletions: metrics.completions,
        conversionRate: metrics.starts > 0 ? (metrics.completions / metrics.starts) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      totalEntries: entries.length,
      metrics: {
        totalStarts: funnelMetrics.totalStarts,
        totalCompletions: funnelMetrics.totalCompletions,
        totalAbandoned: funnelMetrics.totalAbandoned,
        conversionRate: funnelMetrics.conversionRate,
        abandonmentRate: funnelMetrics.abandonmentRate,
      },
      steps: stepAnalytics.map((step) => ({
        stepNumber: step.stepIndex + 1,
        stepName: step.stepName,
        stepKey: step.stepKey,
        entries: step.totalViews,
        exits: step.totalExits,
        continues: step.totalContinues,
        conversionRate: step.conversionRate,
        dropOffRate: step.dropOffRate,
        avgTimeOnStep: step.avgTimeOnStep,
      })),
      trends,
    });
  } catch (error) {
    console.error('[API] Error fetching analytics:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
