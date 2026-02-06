/**
 * Data Sync Cron Job
 *
 * Fetches funnel data from Embeddables API and stores in database
 * Should run every 15-30 minutes via external cron service
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { FUNNEL_PAGES, isPurchaseComplete } from '@/lib/funnel-pages';

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
    // Verify cron secret for external calls.
    // Internal calls (from the browser via the dashboard Sync button) include
    // a Referer/Origin header from the same site and don't need the secret.
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const referer = request.headers.get('referer') || '';
    const origin = request.headers.get('origin') || '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN || '';
    const isInternalCall = (referer && referer.includes('/dashboard')) ||
                           (origin && appUrl && origin.includes(appUrl));

    if (cronSecret && !isInternalCall && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Sync] Starting data sync from Embeddables API...');

    const apiKey = process.env.EMBEDDABLES_API_KEY;
    const projectId = process.env.EMBEDDABLES_PROJECT_ID;
    const embeddableId = process.env.EMBEDDABLES_EMBEDDABLE_ID;

    if (!apiKey || !projectId) {
      throw new Error('EMBEDDABLES_API_KEY or EMBEDDABLES_PROJECT_ID not configured');
    }

    // Fetch ALL entries from Embeddables API with pagination
    const entries: EmbeddablesEntry[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.embeddables.com/projects/${projectId}/entries-page-views?limit=${limit}&offset=${offset}`,
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

      const batch: EmbeddablesEntry[] = await response.json();
      console.log(`[Sync] Fetched batch of ${batch.length} entries (offset: ${offset})`);

      // Filter each batch immediately to reduce memory usage
      if (embeddableId) {
        const filtered = batch.filter((e: EmbeddablesEntry) => e.embeddable_id === embeddableId);
        entries.push(...filtered);
        console.log(`[Sync] Batch filtered: ${batch.length} -> ${filtered.length} (embeddable: ${embeddableId})`);
      } else {
        entries.push(...batch);
      }

      // If we got fewer than limit, we've reached the end
      if (batch.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Safety limit to prevent infinite loops (max 100,000 entries)
      if (offset >= 100000) {
        console.log('[Sync] Reached safety limit of 100,000 entries');
        hasMore = false;
      }
    }

    console.log(`[Sync] Total entries after filtering: ${entries.length}`);

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

    // Helper function to check if entry completed a purchase
    // Uses the static page definitions from funnel-pages.ts
    const hasCompletedPurchase = (pageViews: EmbeddablesEntry['page_views']) => {
      if (!pageViews || pageViews.length === 0) return false;
      // Check if any page_key is a purchase completion page
      // payment_successful (page 53) or asnyc_confirmation_to_redirect (page 54)
      return pageViews.some(pv => isPurchaseComplete(pv.page_key));
    };

    // Create all 55 page step definitions upfront
    for (const pageDef of FUNNEL_PAGES) {
      await prisma.funnelStep.upsert({
        where: {
          funnelId_stepNumber: {
            funnelId: funnel.id,
            stepNumber: pageDef.pageNumber,
          },
        },
        create: {
          funnelId: funnel.id,
          stepNumber: pageDef.pageNumber,
          stepName: pageDef.pageName,
          stepKey: pageDef.pageKey,
        },
        update: {
          stepName: pageDef.pageName,
          stepKey: pageDef.pageKey,
        },
      });
    }

    // Update funnel total steps to 55
    await prisma.funnel.update({
      where: { id: funnel.id },
      data: { totalSteps: FUNNEL_PAGES.length },
    });

    // Process entries and store in database
    let entriesProcessed = 0;

    // Group analytics by date, keyed by pageKey (not page_index)
    // This maps page_key to analytics data per day
    const dailyStepData = new Map<string, Map<string, {
      views: number;
      exits: number;
      continues: number;
    }>>();

    const dailyFunnelData = new Map<string, {
      starts: number;
      completions: number;
    }>();

    for (const entry of entries) {
      // Use entry's created_at date for analytics (UTC midnight, timezone-independent)
      const d = new Date(entry.created_at);
      const entryDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dateKey = entryDate.toISOString();

      // Initialize daily maps if needed
      if (!dailyStepData.has(dateKey)) {
        dailyStepData.set(dateKey, new Map());
      }
      if (!dailyFunnelData.has(dateKey)) {
        dailyFunnelData.set(dateKey, { starts: 0, completions: 0 });
      }

      const dailySteps = dailyStepData.get(dateKey)!;
      const dailyFunnel = dailyFunnelData.get(dateKey)!;

      // Determine if entry completed a purchase
      const pageViews = entry.page_views || [];
      const maxPageIndex = pageViews.length > 0
        ? Math.max(...pageViews.map(pv => pv.page_index))
        : 0;
      const isCompleted = hasCompletedPurchase(pageViews);

      // Update daily funnel counts
      dailyFunnel.starts++;
      if (isCompleted) {
        dailyFunnel.completions++;
      }

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

      // Process page views for step analytics (keyed by page_key)
      // Deduplicate by page_key: keep only the LAST occurrence of each key
      // per entry. This handles conditional branching where the same page
      // appears at multiple indices (e.g., social_proof at index 27 and 29).
      // Using last occurrence ensures correct exit attribution.
      const lastOccurrenceByKey = new Map<string, { arrayPosition: number; pageIndex: number }>();
      for (let i = 0; i < pageViews.length; i++) {
        const pv = pageViews[i];
        lastOccurrenceByKey.set(pv.page_key, { arrayPosition: i, pageIndex: pv.page_index });
      }

      const lastArrayPosition = pageViews.length - 1;

      for (const [pageKey, occurrence] of lastOccurrenceByKey) {
        const isLastStep = occurrence.arrayPosition === lastArrayPosition;
        const isExit = isLastStep && !isCompleted;

        const existing = dailySteps.get(pageKey) || {
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

        dailySteps.set(pageKey, existing);
      }

      entriesProcessed++;
    }

    // Collect all unique page_keys with their typical index for ordering
    const pageKeyIndexMap = new Map<string, number>();
    for (const [, dailySteps] of dailyStepData) {
      for (const pageKey of dailySteps.keys()) {
        if (!pageKeyIndexMap.has(pageKey)) {
          // Find the typical page_index for this key from any entry
          for (const entry of entries) {
            const pv = entry.page_views?.find(p => p.page_key === pageKey);
            if (pv) {
              pageKeyIndexMap.set(pageKey, pv.page_index);
              break;
            }
          }
        }
      }
    }

    // Auto-create FunnelStep records for API keys not in our 55 definitions
    const existingStepKeys = new Set(FUNNEL_PAGES.map(p => p.pageKey));
    let nextStepNumber = FUNNEL_PAGES.length + 1;
    for (const [pageKey, apiIndex] of pageKeyIndexMap) {
      if (!existingStepKeys.has(pageKey)) {
        const stepName = pageKey
          .split('_')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        await prisma.funnelStep.upsert({
          where: {
            funnelId_stepNumber: {
              funnelId: funnel.id,
              stepNumber: 1000 + apiIndex, // Use 1000+ offset for auto-created steps
            },
          },
          create: {
            funnelId: funnel.id,
            stepNumber: 1000 + apiIndex,
            stepName,
            stepKey: pageKey,
          },
          update: {
            stepName,
            stepKey: pageKey,
          },
        });
        nextStepNumber++;
      }
    }

    // Build a map of stepKey -> stepId for quick lookup
    const steps = await prisma.funnelStep.findMany({
      where: { funnelId: funnel.id },
    });
    const stepKeyToId = new Map<string, string>();
    for (const step of steps) {
      if (step.stepKey) {
        stepKeyToId.set(step.stepKey, step.id);
      }
    }

    // Write step analytics PER DAY
    // Delete all existing analytics for each date first to clear stale data
    // (e.g., from previous syncs before embeddable_id filtering was added)
    const stepIds = steps.map(s => s.id);
    let stepsProcessed = 0;

    for (const [dateKey, dailySteps] of dailyStepData) {
      const analyticsDate = new Date(dateKey);

      // Delete ALL existing step analytics for this date to prevent stale duplicates
      await prisma.stepAnalytics.deleteMany({
        where: {
          stepId: { in: stepIds },
          date: analyticsDate,
          hour: null,
        },
      });

      for (const [pageKey, data] of dailySteps) {
        const stepId = stepKeyToId.get(pageKey);
        if (!stepId) continue; // Skip if page_key doesn't match our definitions

        const dropOffRate = data.views > 0 ? (data.exits / data.views) * 100 : 0;
        const conversionRate = data.views > 0 ? (data.continues / data.views) * 100 : 0;

        await prisma.stepAnalytics.create({
          data: {
            stepId,
            date: analyticsDate,
            entries: data.views,
            exits: data.exits,
            conversions: data.continues,
            dropOffRate,
            conversionRate,
            avgTimeOnStep: 0,
          },
        });

        stepsProcessed++;
      }
    }

    // Calculate and store funnel analytics PER DAY
    const totalStarts = entries.length;
    const totalCompletions = entries.filter(e => hasCompletedPurchase(e.page_views)).length;
    const funnelConversionRate = totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0;

    for (const [dateKey, dailyFunnel] of dailyFunnelData) {
      const analyticsDate = new Date(dateKey);
      const dailyConversionRate = dailyFunnel.starts > 0
        ? (dailyFunnel.completions / dailyFunnel.starts) * 100
        : 0;

      // Delete existing funnel analytics for this date to clear stale data
      await prisma.funnelAnalytics.deleteMany({
        where: {
          funnelId: funnel.id,
          date: analyticsDate,
          hour: null,
        },
      });

      await prisma.funnelAnalytics.create({
        data: {
          funnelId: funnel.id,
          date: analyticsDate,
          totalStarts: dailyFunnel.starts,
          totalCompletions: dailyFunnel.completions,
          totalDropoffs: dailyFunnel.starts - dailyFunnel.completions,
          conversionRate: dailyConversionRate,
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

    // Collect all unique page keys seen in the data
    const seenPageKeys = new Set<string>();
    for (const [, dailySteps] of dailyStepData) {
      for (const pageKey of dailySteps.keys()) {
        seenPageKeys.add(pageKey);
      }
    }

    // Find pages from our definition that had no data
    const pagesWithNoData = FUNNEL_PAGES
      .filter(p => !seenPageKeys.has(p.pageKey))
      .map(p => `${p.pageNumber}: ${p.pageKey}`);

    console.log(`[Sync] Completed in ${duration}ms - Entries: ${entriesProcessed}, Steps: ${stepsProcessed}, Days: ${dailyFunnelData.size}`);

    return NextResponse.json({
      success: true,
      entriesProcessed,
      stepsProcessed,
      daysProcessed: dailyFunnelData.size,
      funnelMetrics: {
        totalStarts,
        totalCompletions,
        conversionRate: funnelConversionRate.toFixed(2),
      },
      pageInfo: {
        totalPagesDefinition: FUNNEL_PAGES.length,
        pagesWithData: seenPageKeys.size,
        pagesWithNoData: pagesWithNoData.length > 0 ? pagesWithNoData : 'all pages have data',
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
