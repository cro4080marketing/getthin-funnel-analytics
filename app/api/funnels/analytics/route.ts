import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { subDays, startOfDay, endOfDay, format, eachDayOfInterval } from 'date-fns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/funnels/analytics
 * Get analytics from the database (populated via webhook)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Accept explicit start/end dates from dashboard, or fall back to days parameter
    let startDate: Date;
    let endDate: Date;

    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    if (startParam && endParam) {
      startDate = startOfDay(new Date(startParam));
      endDate = endOfDay(new Date(endParam));
    } else {
      const days = parseInt(searchParams.get('days') || '30', 10);
      endDate = endOfDay(new Date());
      startDate = startOfDay(subDays(endDate, days));
    }

    // Get the main funnel
    const funnel = await prisma.funnel.findFirst({
      where: { status: 'active' },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
        },
      },
    });

    if (!funnel) {
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
        message: 'No funnel data yet. Waiting for webhook data from Embeddables.',
      });
    }

    // Get funnel analytics for the period
    const funnelAnalytics = await prisma.funnelAnalytics.findMany({
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
      orderBy: [
        { step: { stepNumber: 'asc' } },
        { date: 'desc' },
      ],
    });

    // Calculate totals
    const totalStarts = funnelAnalytics.reduce((sum, a) => sum + a.totalStarts, 0);
    const totalCompletions = funnelAnalytics.reduce((sum, a) => sum + a.totalCompletions, 0);
    const conversionRate = totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0;

    // Group step analytics by step
    const stepMetrics = new Map<string, {
      stepNumber: number;
      stepName: string;
      stepKey: string | null;
      entries: number;
      exits: number;
      conversions: number;
      avgDropOffRate: number;
      avgConversionRate: number;
      avgTimeOnStep: number;
      timeOnStepCount: number; // For calculating weighted average
    }>();

    // Initialize ALL steps with zero values first
    for (const step of funnel.steps) {
      stepMetrics.set(step.id, {
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        stepKey: step.stepKey,
        entries: 0,
        exits: 0,
        conversions: 0,
        avgDropOffRate: 0,
        avgConversionRate: 0,
        avgTimeOnStep: 0,
        timeOnStepCount: 0,
      });
    }

    // Then add actual analytics data
    for (const sa of stepAnalytics) {
      const key = sa.step.id;
      const existing = stepMetrics.get(key);
      if (existing) {
        existing.entries += sa.entries;
        existing.exits += sa.exits;
        existing.conversions += sa.conversions;
        // Accumulate time for weighted average
        if (sa.avgTimeOnStep && sa.avgTimeOnStep > 0) {
          existing.avgTimeOnStep += sa.avgTimeOnStep * sa.entries;
          existing.timeOnStepCount += sa.entries;
        }
        // Recalculate rates based on totals
        existing.avgDropOffRate = existing.entries > 0
          ? (existing.exits / existing.entries) * 100
          : 0;
        existing.avgConversionRate = existing.entries > 0
          ? (existing.conversions / existing.entries) * 100
          : 0;
      }
    }

    // Build trends from funnel analytics
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
    const analyticsMap = new Map(
      funnelAnalytics.map(a => [format(a.date, 'yyyy-MM-dd'), a])
    );

    const trends = dateRange.map(date => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const analytics = analyticsMap.get(dateKey);
      return {
        date: dateKey,
        totalStarts: analytics?.totalStarts || 0,
        totalCompletions: analytics?.totalCompletions || 0,
        conversionRate: analytics?.conversionRate || 0,
      };
    });

    return NextResponse.json({
      success: true,
      totalEntries: totalStarts, // For dashboard "no data" check
      dateRange: {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
        days,
      },
      funnel: {
        id: funnel.id,
        name: funnel.name,
        totalSteps: funnel.totalSteps,
      },
      metrics: {
        totalStarts,
        totalCompletions,
        totalAbandoned: totalStarts - totalCompletions,
        conversionRate: Number(conversionRate.toFixed(2)),
        abandonmentRate: totalStarts > 0 ? Number((((totalStarts - totalCompletions) / totalStarts) * 100).toFixed(2)) : 0,
      },
      steps: Array.from(stepMetrics.values())
        .sort((a, b) => a.stepNumber - b.stepNumber)
        .map(step => ({
          stepNumber: step.stepNumber,
          stepName: step.stepName,
          stepKey: step.stepKey,
          entries: step.entries,
          exits: step.exits,
          continues: step.conversions,
          conversionRate: step.avgConversionRate,
          dropOffRate: step.avgDropOffRate,
          avgTimeOnStep: step.timeOnStepCount > 0
            ? Math.round(step.avgTimeOnStep / step.timeOnStepCount)
            : 0,
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
