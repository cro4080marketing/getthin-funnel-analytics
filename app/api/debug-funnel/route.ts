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
    return NextResponse.json({
      error: 'API not configured',
      diagnostics: {
        EMBEDDABLES_API_KEY: apiKey ? `set (${apiKey.length} chars)` : 'NOT SET',
        EMBEDDABLES_PROJECT_ID: projectId || 'NOT SET',
      },
    }, { status: 500 });
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
    const errorBody = await response.text().catch(() => 'no body');
    return NextResponse.json({
      error: `Embeddables API error: ${response.status} ${response.statusText}`,
      diagnostics: {
        EMBEDDABLES_API_KEY: `set (${apiKey.length} chars, starts with ${apiKey.substring(0, 4)}...)`,
        EMBEDDABLES_PROJECT_ID: projectId,
        apiResponse: errorBody.substring(0, 500),
        hint: response.status === 401
          ? 'API key rejected. Verify EMBEDDABLES_API_KEY in Railway environment variables.'
          : undefined,
      },
    }, { status: 502 });
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

  // Aggregate by page_key (not page_index) to reveal hidden keys
  // that share indices with other keys due to conditional branching
  const keyCountMap = new Map<string, number>();
  for (const entry of entries) {
    // Deduplicate per entry: count each page_key only once per entry
    const seenKeys = new Set<string>();
    for (const pv of (entry.page_views || [])) {
      seenKeys.add(pv.page_key);
    }
    for (const k of seenKeys) {
      keyCountMap.set(k, (keyCountMap.get(k) || 0) + 1);
    }
  }
  const stepsByKey = Array.from(keyCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, uniqueEntries: count }));

  // Investigate payment_successful: find entries that reached the furthest steps
  // and show their complete page_key lists with indices
  const purchaseInvestigation: {
    entriesReachingAsyncConfirm: number;
    entriesReachingCalendar: number;
    entriesReachingPaymentSuccessful: number;
    paymentSuccessfulIndices: number[];
    asyncConfirmIndices: number[];
    allKeysContainingPayment: string[];
    sampleCompletedEntryKeys: string[][];
    samplePaymentSuccessfulEntry: Array<{ page_key: string; page_index: number }> | null;
  } = {
    entriesReachingAsyncConfirm: 0,
    entriesReachingCalendar: 0,
    entriesReachingPaymentSuccessful: 0,
    paymentSuccessfulIndices: [],
    asyncConfirmIndices: [],
    allKeysContainingPayment: [],
    sampleCompletedEntryKeys: [],
    samplePaymentSuccessfulEntry: null,
  };

  const paymentKeySet = new Set<string>();
  const paySuccessIndexSet = new Set<number>();
  const asyncConfirmIndexSet = new Set<number>();
  for (const entry of entries) {
    const pvs = entry.page_views || [];
    const keys = pvs.map((pv: any) => pv.page_key);

    // Check for any key containing "pay" or "payment" or "success"
    for (const pv of pvs) {
      if (pv.page_key && (pv.page_key.includes('pay') || pv.page_key.includes('purchase') || pv.page_key.includes('success'))) {
        paymentKeySet.add(pv.page_key);
      }
      if (pv.page_key === 'payment_successful') {
        paySuccessIndexSet.add(pv.page_index);
      }
      if (pv.page_key === 'asnyc_confirmation_to_redirect') {
        asyncConfirmIndexSet.add(pv.page_index);
      }
    }

    if (keys.includes('payment_successful')) {
      purchaseInvestigation.entriesReachingPaymentSuccessful++;
      if (!purchaseInvestigation.samplePaymentSuccessfulEntry) {
        purchaseInvestigation.samplePaymentSuccessfulEntry = pvs.map((pv: any) => ({
          page_key: pv.page_key,
          page_index: pv.page_index,
        }));
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
  purchaseInvestigation.paymentSuccessfulIndices = Array.from(paySuccessIndexSet).sort((a, b) => a - b);
  purchaseInvestigation.asyncConfirmIndices = Array.from(asyncConfirmIndexSet).sort((a, b) => a - b);

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
    stepsByIndex: steps,
    stepsByKey,
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
