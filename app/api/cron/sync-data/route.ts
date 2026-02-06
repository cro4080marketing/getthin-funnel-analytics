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
    // Auth: allow external cron (Bearer token) and dashboard Sync button (same-origin)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const referer = request.headers.get('referer') || '';
    const secFetchSite = request.headers.get('sec-fetch-site') || '';

    // sec-fetch-site is set by browsers automatically and reliably for fetch() calls
    const isInternalCall = secFetchSite === 'same-origin' ||
                           referer.includes('/dashboard');

    if (cronSecret && !isInternalCall && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Sync] Starting data sync from Embeddables API...');

    const apiKey = process.env.EMBEDDABLES_API_KEY;
    const projectId = process.env.EMBEDDABLES_PROJECT_ID;
    const embeddableId = process.env.EMBEDDABLES_EMBEDDABLE_ID;

    if (!apiKey || !projectId) {
      return NextResponse.json({
        success: false,
        error: 'Missing environment variables',
        diagnostics: {
          EMBEDDABLES_API_KEY: apiKey ? `set (${apiKey.length} chars, starts with ${apiKey.substring(0, 4)}...)` : 'NOT SET',
          EMBEDDABLES_PROJECT_ID: projectId ? `set (${projectId})` : 'NOT SET',
          EMBEDDABLES_EMBEDDABLE_ID: embeddableId || 'NOT SET (will fetch all embeddables)',
        },
      }, { status: 500 });
    }

    console.log(`[Sync] Using API key: ${apiKey.substring(0, 4)}... (${apiKey.length} chars)`);
    console.log(`[Sync] Project: ${projectId}, Embeddable filter: ${embeddableId || 'none'}`);

    // Fetch entries from Embeddables API with pagination
    // Time-limited: stop fetching after 90 seconds and process what we have.
    // This prevents timeouts on Railway (which may kill requests after 2-5 mins).
    const entries: EmbeddablesEntry[] = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    const fetchDeadline = Date.now() + 90_000; // 90 second fetch budget
    let stoppedEarly = false;

    while (hasMore) {
      // Check time budget before next API call
      if (Date.now() > fetchDeadline) {
        console.log(`[Sync] Reached 90s fetch time limit at offset ${offset}. Processing ${entries.length} entries.`);
        stoppedEarly = true;
        hasMore = false;
        break;
      }

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
        const errorBody = await response.text().catch(() => 'no body');
        return NextResponse.json({
          success: false,
          error: `Embeddables API error: ${response.status} ${response.statusText}`,
          diagnostics: {
            EMBEDDABLES_API_KEY: `set (${apiKey.length} chars, starts with ${apiKey.substring(0, 4)}...)`,
            EMBEDDABLES_PROJECT_ID: projectId,
            apiResponse: errorBody.substring(0, 500),
            hint: response.status === 401
              ? 'The API key is being rejected. Check that EMBEDDABLES_API_KEY is correct in your Railway environment variables.'
              : 'Check the Embeddables API status.',
          },
        }, { status: 502 });
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
          totalSteps: FUNNEL_PAGES.length,
          status: 'active',
        },
      });
    }

    // Helper function to check if entry completed a purchase
    const hasCompletedPurchase = (pageViews: EmbeddablesEntry['page_views']) => {
      if (!pageViews || pageViews.length === 0) return false;
      return pageViews.some(pv => isPurchaseComplete(pv.page_key));
    };

    // Create all 55 page step definitions upfront (batch with transaction)
    await prisma.$transaction(
      FUNNEL_PAGES.map(pageDef =>
        prisma.funnelStep.upsert({
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
        })
      )
    );

    // Update funnel total steps
    await prisma.funnel.update({
      where: { id: funnel.id },
      data: { totalSteps: FUNNEL_PAGES.length },
    });

    // Process entries: aggregate by date and page_key
    // NOTE: FunnelEntry upserts removed - that table is write-only and
    // was causing timeouts (thousands of individual DB writes).
    // The dashboard reads from StepAnalytics and FunnelAnalytics only.
    let entriesProcessed = 0;

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
      // Use entry's created_at date for analytics (UTC midnight)
      const d = new Date(entry.created_at);
      const entryDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dateKey = entryDate.toISOString();

      if (!dailyStepData.has(dateKey)) {
        dailyStepData.set(dateKey, new Map());
      }
      if (!dailyFunnelData.has(dateKey)) {
        dailyFunnelData.set(dateKey, { starts: 0, completions: 0 });
      }

      const dailySteps = dailyStepData.get(dateKey)!;
      const dailyFunnel = dailyFunnelData.get(dateKey)!;

      const pageViews = entry.page_views || [];
      const isCompleted = hasCompletedPurchase(pageViews);

      dailyFunnel.starts++;
      if (isCompleted) {
        dailyFunnel.completions++;
      }

      // Deduplicate by page_key per entry: keep only the LAST occurrence.
      // Handles conditional branching where same page appears at multiple indices.
      const lastOccurrenceByKey = new Map<string, { arrayPosition: number; pageIndex: number }>();
      for (let i = 0; i < pageViews.length; i++) {
        const pv = pageViews[i];
        lastOccurrenceByKey.set(pv.page_key, { arrayPosition: i, pageIndex: pv.page_index });
      }

      const lastArrayPosition = pageViews.length - 1;

      for (const [pageKey, occurrence] of lastOccurrenceByKey) {
        const isLastStep = occurrence.arrayPosition === lastArrayPosition;
        const isExit = isLastStep && !isCompleted;

        const existing = dailySteps.get(pageKey) || { views: 0, exits: 0, continues: 0 };
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
    let autoStepNumber = 1000;
    for (const [pageKey] of pageKeyIndexMap) {
      if (!existingStepKeys.has(pageKey)) {
        const stepName = pageKey
          .split('_')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        await prisma.funnelStep.upsert({
          where: {
            funnelId_stepNumber: {
              funnelId: funnel.id,
              stepNumber: autoStepNumber,
            },
          },
          create: {
            funnelId: funnel.id,
            stepNumber: autoStepNumber,
            stepName,
            stepKey: pageKey,
          },
          update: {
            stepName,
            stepKey: pageKey,
          },
        });
        autoStepNumber++;
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

    // Write step analytics PER DAY using batch operations
    const stepIds = steps.map(s => s.id);
    let stepsProcessed = 0;

    for (const [dateKey, dailySteps] of dailyStepData) {
      const analyticsDate = new Date(dateKey);

      // Delete ALL existing step analytics for this date
      await prisma.stepAnalytics.deleteMany({
        where: {
          stepId: { in: stepIds },
          date: analyticsDate,
          hour: null,
        },
      });

      // Batch create all step analytics for this date
      const stepRecords: Array<{
        stepId: string;
        date: Date;
        entries: number;
        exits: number;
        conversions: number;
        dropOffRate: number;
        conversionRate: number;
        avgTimeOnStep: number;
      }> = [];

      for (const [pageKey, data] of dailySteps) {
        const stepId = stepKeyToId.get(pageKey);
        if (!stepId) continue;

        const dropOffRate = data.views > 0 ? (data.exits / data.views) * 100 : 0;
        const conversionRate = data.views > 0 ? (data.continues / data.views) * 100 : 0;

        stepRecords.push({
          stepId,
          date: analyticsDate,
          entries: data.views,
          exits: data.exits,
          conversions: data.continues,
          dropOffRate,
          conversionRate,
          avgTimeOnStep: 0,
        });
        stepsProcessed++;
      }

      if (stepRecords.length > 0) {
        await prisma.stepAnalytics.createMany({ data: stepRecords });
      }
    }

    // Write funnel analytics PER DAY
    const totalStarts = entries.length;
    const totalCompletions = entries.filter(e => hasCompletedPurchase(e.page_views)).length;
    const funnelConversionRate = totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0;

    for (const [dateKey, dailyFunnel] of dailyFunnelData) {
      const analyticsDate = new Date(dateKey);
      const dailyConversionRate = dailyFunnel.starts > 0
        ? (dailyFunnel.completions / dailyFunnel.starts) * 100
        : 0;

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

    const pagesWithNoData = FUNNEL_PAGES
      .filter(p => !seenPageKeys.has(p.pageKey))
      .map(p => `${p.pageNumber}: ${p.pageKey}`);

    // Purchase verification: show step counts for purchase-related keys
    const purchaseKeys = ['payment_successful', 'asnyc_confirmation_to_redirect', 'calendar_page'];
    const purchaseVerification: Record<string, number> = {};
    for (const pk of purchaseKeys) {
      let total = 0;
      for (const [, dailySteps] of dailyStepData) {
        const data = dailySteps.get(pk);
        if (data) total += data.views;
      }
      purchaseVerification[pk] = total;
    }

    console.log(`[Sync] Completed in ${duration}ms - Entries: ${entriesProcessed}, Steps: ${stepsProcessed}, Days: ${dailyFunnelData.size}`);

    return NextResponse.json({
      success: true,
      partial: stoppedEarly,
      entriesProcessed,
      stepsProcessed,
      daysProcessed: dailyFunnelData.size,
      funnelMetrics: {
        totalStarts,
        totalCompletions,
        conversionRate: funnelConversionRate.toFixed(2),
      },
      purchaseVerification,
      pageInfo: {
        totalPagesDefinition: FUNNEL_PAGES.length,
        pagesWithData: seenPageKeys.size,
        pagesWithNoData: pagesWithNoData.length > 0 ? pagesWithNoData : 'all pages have data',
      },
      duration,
      ...(stoppedEarly ? { note: `Fetched ${entriesProcessed} entries in 90s. Run sync again or via cron for remaining historical data.` } : {}),
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
