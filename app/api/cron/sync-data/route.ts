/**
 * Data Sync Cron Job
 *
 * Fetches funnel data from Embeddables API and stores in database
 * Should run every 15-30 minutes via Railway Cron or external cron service
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { embeddables } from '@/lib/integrations/embeddables';
import { startOfDay, endOfDay } from 'date-fns';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max execution

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Sync] Starting funnel data sync...');

    // Fetch entries from Embeddables
    const entries = await embeddables.getEntriesPageViews(1000);
    console.log(`[Sync] Fetched ${entries.length} entries from Embeddables`);

    if (entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entries to sync',
        recordsProcessed: 0,
      });
    }

    // Process step analytics from entries
    const stepAnalytics = embeddables.processPageViewsToStepAnalytics(entries);
    const funnelMetrics = embeddables.calculateFunnelMetrics(entries);

    // Get or create a default funnel (since Embeddables may not have a flows endpoint)
    const projectId = process.env.EMBEDDABLES_PROJECT_ID || 'pr_WU28KvQa9qZ4BOuW';
    let funnel = await prisma.funnel.findFirst({
      where: { embeddablesId: projectId },
    });

    if (!funnel) {
      funnel = await prisma.funnel.create({
        data: {
          embeddablesId: projectId,
          name: 'Main Questionnaire',
          totalSteps: stepAnalytics.length,
          status: 'active',
        },
      });
      console.log(`[Sync] Created new funnel: ${funnel.name}`);
    } else {
      // Update funnel
      funnel = await prisma.funnel.update({
        where: { id: funnel.id },
        data: {
          totalSteps: stepAnalytics.length,
          updatedAt: new Date(),
        },
      });
    }

    const today = startOfDay(new Date());
    let stepsProcessed = 0;

    // Upsert steps and their analytics
    for (const stepData of stepAnalytics) {
      // Upsert step
      const step = await prisma.funnelStep.upsert({
        where: {
          funnelId_stepNumber: {
            funnelId: funnel.id,
            stepNumber: stepData.stepIndex,
          },
        },
        create: {
          funnelId: funnel.id,
          stepNumber: stepData.stepIndex,
          stepName: stepData.stepName,
          stepKey: stepData.stepKey,
        },
        update: {
          stepName: stepData.stepName,
          stepKey: stepData.stepKey,
        },
      });

      // Find existing step analytics for today or create new
      const existingStepAnalytics = await prisma.stepAnalytics.findFirst({
        where: {
          stepId: step.id,
          date: today,
          hour: null,
          deviceType: null,
          browser: null,
        },
      });

      if (existingStepAnalytics) {
        await prisma.stepAnalytics.update({
          where: { id: existingStepAnalytics.id },
          data: {
            entries: stepData.totalViews,
            exits: stepData.totalExits,
            conversions: stepData.totalContinues,
            dropOffRate: stepData.dropOffRate,
            conversionRate: stepData.conversionRate,
            avgTimeOnStep: stepData.avgTimeOnStep,
          },
        });
      } else {
        await prisma.stepAnalytics.create({
          data: {
            stepId: step.id,
            date: today,
            entries: stepData.totalViews,
            exits: stepData.totalExits,
            conversions: stepData.totalContinues,
            dropOffRate: stepData.dropOffRate,
            conversionRate: stepData.conversionRate,
            avgTimeOnStep: stepData.avgTimeOnStep,
          },
        });
      }

      stepsProcessed++;
    }

    // Find existing funnel analytics for today or create new
    const existingFunnelAnalytics = await prisma.funnelAnalytics.findFirst({
      where: {
        funnelId: funnel.id,
        date: today,
        hour: null,
        deviceType: null,
        browser: null,
      },
    });

    if (existingFunnelAnalytics) {
      await prisma.funnelAnalytics.update({
        where: { id: existingFunnelAnalytics.id },
        data: {
          totalStarts: funnelMetrics.totalStarts,
          totalCompletions: funnelMetrics.totalCompletions,
          totalDropoffs: funnelMetrics.totalAbandoned,
          conversionRate: funnelMetrics.conversionRate,
        },
      });
    } else {
      await prisma.funnelAnalytics.create({
        data: {
          funnelId: funnel.id,
          date: today,
          totalStarts: funnelMetrics.totalStarts,
          totalCompletions: funnelMetrics.totalCompletions,
          totalDropoffs: funnelMetrics.totalAbandoned,
          conversionRate: funnelMetrics.conversionRate,
        },
      });
    }

    const duration = Date.now() - startTime;

    // Log sync execution
    await prisma.syncLog.create({
      data: {
        syncType: 'embeddables_fetch',
        status: 'success',
        recordsProcessed: entries.length,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
    });

    console.log(
      `[Sync] Completed in ${duration}ms - Entries: ${entries.length}, Steps: ${stepsProcessed}`
    );

    return NextResponse.json({
      success: true,
      entriesProcessed: entries.length,
      stepsProcessed,
      funnelMetrics: {
        totalStarts: funnelMetrics.totalStarts,
        totalCompletions: funnelMetrics.totalCompletions,
        conversionRate: funnelMetrics.conversionRate,
      },
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed sync
    try {
      await prisma.syncLog.create({
        data: {
          syncType: 'embeddables_fetch',
          status: 'failed',
          recordsProcessed: 0,
          errorMessage,
          startedAt: new Date(startTime),
          completedAt: new Date(),
        },
      });
    } catch (logError) {
      console.error('[Sync] Failed to log sync error:', logError);
    }

    console.error('[Sync] Fatal error:', error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        duration,
      },
      { status: 500 }
    );
  }
}
