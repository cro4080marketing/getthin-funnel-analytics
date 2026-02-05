/**
 * Data Sync Cron Job
 *
 * Fetches funnel data from Embeddables API and stores in database
 * Should run every 15-30 minutes via external cron service
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { startOfDay } from 'date-fns';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max execution

// Embeddables API response types (snake_case from API)
interface EmbeddablesEntry {
  entry_id: string;
  project_id: string;
  embeddable_id: string;
  contact_id?: string;
  created_at: string;
  updated_at: string;
  entry_data?: string;
  page_views?: Array<{
    timestamp: string;
    page_id: string;
    page_key: string;
    page_index: number;
    url?: string;
  }>;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Sync] Starting data sync from Embeddables API...');

    const apiKey = process.env.EMBEDDABLES_API_KEY;
    const projectId = process.env.EMBEDDABLES_PROJECT_ID;

    if (!apiKey || !projectId) {
      throw new Error('EMBEDDABLES_API_KEY or EMBEDDABLES_PROJECT_ID not configured');
    }

    // Fetch entries from Embeddables API
    const response = await fetch(
      `https://api.embeddables.com/projects/${projectId}/entries-page-views?limit=1000`,
      {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Embeddables API error: ${response.status} ${response.statusText}`);
    }

    const entries: EmbeddablesEntry[] = await response.json();
    console.log(`[Sync] Fetched ${entries.length} entries from Embeddables`);

    if (entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entries found in Embeddables',
        entriesProcessed: 0,
      });
    }

    // Get or create funnel
    let funnel = await prisma.funnel.findFirst({
      where: { embeddablesId: projectId },
    });

    if (!funnel) {
      funnel = await prisma.funnel.create({
        data: {
          embeddablesId: projectId,
          name: 'Get Thin MD Quiz',
          totalSteps: 20,
          status: 'active',
        },
      });
    }

    const today = startOfDay(new Date());

    // Process entries and store in database
    let entriesProcessed = 0;
    const stepDataMap = new Map<number, {
      pageKey: string;
      pageName: string;
      views: number;
      exits: number;
      continues: number;
    }>();

    // Helper function to check if entry completed a purchase
    const hasCompletedPurchase = (pageViews: EmbeddablesEntry['page_views']) => {
      if (!pageViews || pageViews.length === 0) return false;
      // Check if any page_key indicates payment completion
      return pageViews.some(pv =>
        pv.page_key === 'payment_successful' ||
        pv.page_key === 'async_confirmation_to_redirect' ||
        pv.page_key.toLowerCase().includes('payment_successful') ||
        pv.page_key.toLowerCase().includes('confirmation_to_redirect')
      );
    };

    for (const entry of entries) {
      // Determine if entry completed a purchase
      const pageViews = entry.page_views || [];
      const maxPageIndex = pageViews.length > 0
        ? Math.max(...pageViews.map(pv => pv.page_index))
        : 0;
      const isCompleted = hasCompletedPurchase(pageViews);

      // Upsert entry
      await prisma.funnelEntry.upsert({
        where: { entryId: entry.entry_id },
        create: {
          entryId: entry.entry_id,
          funnelId: funnel.id,
          completed: isCompleted,
          lastStepIndex: maxPageIndex,
          totalSteps: pageViews.length,
          timeSpent: 0,
          createdAt: new Date(entry.created_at),
          updatedAt: new Date(entry.updated_at),
        },
        update: {
          completed: isCompleted,
          lastStepIndex: maxPageIndex,
          totalSteps: pageViews.length,
          updatedAt: new Date(entry.updated_at),
        },
      });

      // Process page views for step analytics
      for (let i = 0; i < pageViews.length; i++) {
        const pv = pageViews[i];
        const isLastStep = i === pageViews.length - 1;
        const isExit = isLastStep && !isCompleted;

        const existing = stepDataMap.get(pv.page_index) || {
          pageKey: pv.page_key,
          pageName: pv.page_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          views: 0,
          exits: 0,
          continues: 0,
        };

        existing.views++;
        if (isExit) {
          existing.exits++;
        } else {
          existing.continues++;
        }

        stepDataMap.set(pv.page_index, existing);
      }

      entriesProcessed++;
    }

    // Update funnel total steps
    const maxStepFound = Math.max(...Array.from(stepDataMap.keys()), 0);
    await prisma.funnel.update({
      where: { id: funnel.id },
      data: { totalSteps: maxStepFound + 1 },
    });

    // Create/update steps and step analytics
    let stepsProcessed = 0;
    for (const [stepIndex, data] of stepDataMap) {
      // Upsert step
      const step = await prisma.funnelStep.upsert({
        where: {
          funnelId_stepNumber: {
            funnelId: funnel.id,
            stepNumber: stepIndex,
          },
        },
        create: {
          funnelId: funnel.id,
          stepNumber: stepIndex,
          stepName: data.pageName,
          stepKey: data.pageKey,
        },
        update: {
          stepName: data.pageName,
          stepKey: data.pageKey,
        },
      });

      // Upsert step analytics for today
      const dropOffRate = data.views > 0 ? (data.exits / data.views) * 100 : 0;
      const conversionRate = data.views > 0 ? (data.continues / data.views) * 100 : 0;

      const existingAnalytics = await prisma.stepAnalytics.findFirst({
        where: {
          stepId: step.id,
          date: today,
          hour: null,
        },
      });

      if (existingAnalytics) {
        await prisma.stepAnalytics.update({
          where: { id: existingAnalytics.id },
          data: {
            entries: data.views,
            exits: data.exits,
            conversions: data.continues,
            dropOffRate,
            conversionRate,
          },
        });
      } else {
        await prisma.stepAnalytics.create({
          data: {
            stepId: step.id,
            date: today,
            entries: data.views,
            exits: data.exits,
            conversions: data.continues,
            dropOffRate,
            conversionRate,
            avgTimeOnStep: 0,
          },
        });
      }

      stepsProcessed++;
    }

    // Calculate and store funnel analytics
    const totalStarts = entries.length;
    const totalCompletions = entries.filter(e => hasCompletedPurchase(e.page_views)).length;
    const funnelConversionRate = totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0;

    const existingFunnelAnalytics = await prisma.funnelAnalytics.findFirst({
      where: {
        funnelId: funnel.id,
        date: today,
        hour: null,
      },
    });

    if (existingFunnelAnalytics) {
      await prisma.funnelAnalytics.update({
        where: { id: existingFunnelAnalytics.id },
        data: {
          totalStarts,
          totalCompletions,
          totalDropoffs: totalStarts - totalCompletions,
          conversionRate: funnelConversionRate,
        },
      });
    } else {
      await prisma.funnelAnalytics.create({
        data: {
          funnelId: funnel.id,
          date: today,
          totalStarts,
          totalCompletions,
          totalDropoffs: totalStarts - totalCompletions,
          conversionRate: funnelConversionRate,
        },
      });
    }

    const duration = Date.now() - startTime;

    // Log sync
    await prisma.syncLog.create({
      data: {
        syncType: 'embeddables_api',
        status: 'success',
        recordsProcessed: entriesProcessed,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
    });

    console.log(`[Sync] Completed in ${duration}ms - Entries: ${entriesProcessed}, Steps: ${stepsProcessed}`);

    return NextResponse.json({
      success: true,
      entriesProcessed,
      stepsProcessed,
      funnelMetrics: {
        totalStarts,
        totalCompletions,
        conversionRate: funnelConversionRate.toFixed(2),
      },
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    try {
      await prisma.syncLog.create({
        data: {
          syncType: 'embeddables_api',
          status: 'failed',
          recordsProcessed: 0,
          errorMessage,
          startedAt: new Date(startTime),
          completedAt: new Date(),
        },
      });
    } catch (logError) {
      console.error('[Sync] Failed to log error:', logError);
    }

    console.error('[Sync] Error:', error);

    return NextResponse.json(
      { success: false, error: errorMessage, duration },
      { status: 500 }
    );
  }
}
