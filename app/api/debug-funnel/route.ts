import { NextResponse } from 'next/server';
import { FUNNEL_PAGES } from '@/lib/funnel-pages';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to see actual funnel structure from Embeddables
 */
export async function GET() {
  const apiKey = process.env.EMBEDDABLES_API_KEY;
  const projectId = process.env.EMBEDDABLES_PROJECT_ID;

  if (!apiKey || !projectId) {
    return NextResponse.json({ error: 'API not configured' }, { status: 500 });
  }

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
    return NextResponse.json({ error: 'API error' }, { status: 500 });
  }

  let entries = await response.json();

  // Show embeddable_id distribution before filtering
  const embeddableIds = new Map<string, number>();
  for (const entry of entries) {
    const id = entry.embeddable_id || 'unknown';
    embeddableIds.set(id, (embeddableIds.get(id) || 0) + 1);
  }
  const embeddableDistribution = Object.fromEntries(embeddableIds);

  // Filter by embeddable_id if configured
  const embeddableId = process.env.EMBEDDABLES_EMBEDDABLE_ID;
  const totalBeforeFilter = entries.length;
  if (embeddableId) {
    entries = entries.filter((e: any) => e.embeddable_id === embeddableId);
  }

  // Analyze the funnel structure
  const stepMap = new Map<number, { key: string; count: number }>();
  const maxStepsPerEntry: number[] = [];
  let completedCount = 0;

  for (const entry of entries) {
    const pageViews = entry.page_views || [];

    if (pageViews.length > 0) {
      const maxIdx = Math.max(...pageViews.map((pv: any) => pv.page_index));
      maxStepsPerEntry.push(maxIdx);
    }

    for (const pv of pageViews) {
      const existing = stepMap.get(pv.page_index);
      if (existing) {
        existing.count++;
      } else {
        stepMap.set(pv.page_index, { key: pv.page_key, count: 1 });
      }
    }

    // Check if entry_data has completion markers
    if (entry.entry_data) {
      try {
        const data = JSON.parse(entry.entry_data);
        if (data.completed || data.status === 'completed' || data.product) {
          completedCount++;
        }
      } catch {}
    }
  }

  // Sort steps by index
  const steps = Array.from(stepMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, data]) => ({
      index,
      key: data.key,
      count: data.count,
    }));

  // Find distribution of max steps reached
  const stepDistribution: Record<number, number> = {};
  for (const max of maxStepsPerEntry) {
    stepDistribution[max] = (stepDistribution[max] || 0) + 1;
  }

  const firstStep = steps.length > 0 ? steps[0] : null;
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;

  // Find entries that reached the last step
  const lastStepIndex = lastStep?.index ?? 0;
  const entriesReachingLastStep = maxStepsPerEntry.filter(max => max >= lastStepIndex).length;

  // Detect duplicate page_keys at different indices
  const keyToIndices = new Map<string, number[]>();
  for (const step of steps) {
    const indices = keyToIndices.get(step.key) || [];
    indices.push(step.index);
    keyToIndices.set(step.key, indices);
  }
  const duplicateKeys = Array.from(keyToIndices.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([key, indices]) => ({ key, indices }));

  // Map API keys to our page definitions
  const apiKeysSet = new Set(steps.map(s => s.key));
  const definedKeysSet = new Set(FUNNEL_PAGES.map(p => p.pageKey));
  const unmappedApiKeys = Array.from(apiKeysSet).filter(k => !definedKeysSet.has(k));
  const unusedDefinedKeys = FUNNEL_PAGES
    .filter(p => !apiKeysSet.has(p.pageKey))
    .map(p => ({ pageNumber: p.pageNumber, pageKey: p.pageKey, pageName: p.pageName }));

  // Investigate payment_successful: find entries that reached the furthest steps
  // and show their complete page_key lists
  const purchaseInvestigation: {
    entriesReachingAsyncConfirm: number;
    entriesReachingCalendar: number;
    allKeysContainingPayment: string[];
    sampleCompletedEntryKeys: string[][];
  } = {
    entriesReachingAsyncConfirm: 0,
    entriesReachingCalendar: 0,
    allKeysContainingPayment: [],
    sampleCompletedEntryKeys: [],
  };

  const paymentKeySet = new Set<string>();
  for (const entry of entries) {
    const pvs = entry.page_views || [];
    const keys = pvs.map((pv: any) => pv.page_key);

    // Check for any key containing "pay" or "payment" or "success"
    for (const k of keys) {
      if (k && (k.includes('pay') || k.includes('purchase') || k.includes('success'))) {
        paymentKeySet.add(k);
      }
    }

    if (keys.includes('asnyc_confirmation_to_redirect')) {
      purchaseInvestigation.entriesReachingAsyncConfirm++;
      if (purchaseInvestigation.sampleCompletedEntryKeys.length < 3) {
        purchaseInvestigation.sampleCompletedEntryKeys.push(keys);
      }
    }
    if (keys.includes('calendar_page')) {
      purchaseInvestigation.entriesReachingCalendar++;
    }
  }
  purchaseInvestigation.allKeysContainingPayment = Array.from(paymentKeySet);

  return NextResponse.json({
    totalEntriesBeforeFilter: totalBeforeFilter,
    embeddableFilter: embeddableId || 'none (showing all)',
    embeddableDistribution,
    totalEntries: entries.length,
    completedWithProductData: completedCount,
    totalSteps: steps.length,
    firstStep,
    lastStep,
    entriesReachingLastStep,
    suggestedCompletionStep: lastStepIndex,
    steps,
    maxStepDistribution: stepDistribution,
    dataQuality: {
      duplicateKeys: duplicateKeys.length > 0 ? duplicateKeys : 'none',
      unmappedApiKeys: unmappedApiKeys.length > 0 ? unmappedApiKeys : 'none',
      unusedDefinedPages: unusedDefinedKeys.length > 0 ? unusedDefinedKeys : 'none',
      totalDefinedPages: FUNNEL_PAGES.length,
      totalApiSteps: steps.length,
    },
    purchaseInvestigation,
    sampleEntry: entries[0] ? {
      entry_id: entries[0].entry_id,
      page_views_count: entries[0].page_views?.length,
      has_entry_data: !!entries[0].entry_data,
      entry_data_preview: entries[0].entry_data?.substring(0, 500),
    } : null,
  });
}
