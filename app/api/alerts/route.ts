import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/alerts
 * List all alerts with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // active, acknowledged, resolved
    const severity = searchParams.get('severity'); // critical, warning, info
    const funnelId = searchParams.get('funnelId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: any = {};

    if (status) {
      where.status = status;
    }
    if (severity) {
      where.severity = severity;
    }
    if (funnelId) {
      where.funnelId = funnelId;
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        funnel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    // Calculate summary
    const allActiveAlerts = await prisma.alert.groupBy({
      by: ['severity'],
      where: { status: 'active' },
      _count: true,
    });

    const summary = {
      totalActive: allActiveAlerts.reduce((sum, a) => sum + a._count, 0),
      critical: allActiveAlerts.find((a) => a.severity === 'critical')?._count || 0,
      warnings: allActiveAlerts.find((a) => a.severity === 'warning')?._count || 0,
      info: allActiveAlerts.find((a) => a.severity === 'info')?._count || 0,
    };

    return NextResponse.json({
      alerts: alerts.map((alert) => ({
        id: alert.id,
        funnelId: alert.funnelId,
        funnelName: alert.funnel.name,
        stepNumber: alert.stepNumber,
        severity: alert.severity,
        type: alert.type,
        currentValue: alert.currentValue,
        previousDayValue: alert.previousDayValue,
        sevenDayAverage: alert.sevenDayAverage,
        percentageChange: alert.percentageChange,
        message: alert.message,
        recommendation: alert.recommendation,
        status: alert.status,
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
        resolvedAt: alert.resolvedAt,
        createdAt: alert.createdAt,
      })),
      summary,
    });
  } catch (error) {
    console.error('[API] Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
