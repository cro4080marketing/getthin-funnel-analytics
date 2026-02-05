/**
 * Embeddables API Integration
 *
 * This file handles all communication with the Embeddables API
 * to fetch funnel data, analytics, and step-level metrics.
 *
 * API Documentation: https://docs.embeddables.com
 * The Embeddables platform uses webhooks (DataPipes) to push data,
 * but also provides REST endpoints for fetching page views and entries.
 */

const EMBEDDABLES_API_URL = process.env.EMBEDDABLES_API_URL || 'https://api.embeddables.com';
const EMBEDDABLES_API_KEY = process.env.EMBEDDABLES_API_KEY;
const EMBEDDABLES_PROJECT_ID = process.env.EMBEDDABLES_PROJECT_ID || 'pr_WU28KvQa9qZ4BOuW';

interface EmbeddablesConfig {
  apiKey: string;
  baseUrl: string;
  projectId: string;
}

class EmbeddablesClient {
  private config: EmbeddablesConfig;

  constructor() {
    this.config = {
      apiKey: EMBEDDABLES_API_KEY || '',
      baseUrl: EMBEDDABLES_API_URL,
      projectId: EMBEDDABLES_PROJECT_ID,
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.config.apiKey) {
      throw new Error('EMBEDDABLES_API_KEY is not configured');
    }

    const url = `${this.config.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': this.config.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embeddables API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get all entries with their page views
   * This is the main endpoint for fetching funnel analytics data
   */
  async getEntriesPageViews(limit = 100, offset = 0): Promise<EmbeddablesPageViewEntry[]> {
    return this.request<EmbeddablesPageViewEntry[]>(
      `/projects/${this.config.projectId}/entries-page-views?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Get all entries for a specific flow/funnel
   */
  async getFlowEntries(flowId: string, limit = 100): Promise<EmbeddablesEntry[]> {
    return this.request<EmbeddablesEntry[]>(
      `/projects/${this.config.projectId}/flows/${flowId}/entries?limit=${limit}`
    );
  }

  /**
   * Get aggregated analytics for a project
   */
  async getProjectAnalytics(startDate?: Date, endDate?: Date): Promise<EmbeddablesAnalyticsSummary> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate.toISOString().split('T')[0]);
    if (endDate) params.append('end_date', endDate.toISOString().split('T')[0]);

    return this.request<EmbeddablesAnalyticsSummary>(
      `/projects/${this.config.projectId}/analytics${params.toString() ? '?' + params : ''}`
    );
  }

  /**
   * Get list of flows/funnels in the project
   */
  async getFlows(): Promise<EmbeddablesFlow[]> {
    return this.request<EmbeddablesFlow[]>(
      `/projects/${this.config.projectId}/flows`
    );
  }

  /**
   * Process raw page view entries into step analytics
   */
  processPageViewsToStepAnalytics(entries: EmbeddablesPageViewEntry[]): ProcessedStepAnalytics[] {
    // Group by step and calculate metrics
    const stepMap = new Map<string, {
      stepKey: string;
      stepName: string;
      stepIndex: number;
      views: number;
      exits: number;
      continues: number;
      totalTime: number;
      entriesWithTime: number;
    }>();

    for (const entry of entries) {
      if (!entry.pageViews) continue;

      const sortedViews = [...entry.pageViews].sort((a, b) => a.index - b.index);
      const lastViewIndex = Math.max(...sortedViews.map(v => v.index));

      for (let i = 0; i < sortedViews.length; i++) {
        const view = sortedViews[i];
        const key = view.pageKey || `step_${view.index}`;

        const existing = stepMap.get(key) || {
          stepKey: key,
          stepName: view.pageName || `Step ${view.index + 1}`,
          stepIndex: view.index,
          views: 0,
          exits: 0,
          continues: 0,
          totalTime: 0,
          entriesWithTime: 0,
        };

        existing.views++;

        // Check if user exited at this step (it's their last step and they didn't complete)
        if (view.index === lastViewIndex && !entry.completed) {
          existing.exits++;
        } else if (i < sortedViews.length - 1 || entry.completed) {
          existing.continues++;
        }

        // Track time on step
        if (view.timeSpent && view.timeSpent > 0) {
          existing.totalTime += view.timeSpent;
          existing.entriesWithTime++;
        }

        stepMap.set(key, existing);
      }
    }

    // Convert to array and calculate rates
    return Array.from(stepMap.values())
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map(step => ({
        stepKey: step.stepKey,
        stepName: step.stepName,
        stepIndex: step.stepIndex,
        totalViews: step.views,
        totalExits: step.exits,
        totalContinues: step.continues,
        dropOffRate: step.views > 0 ? (step.exits / step.views) * 100 : 0,
        conversionRate: step.views > 0 ? (step.continues / step.views) * 100 : 0,
        avgTimeOnStep: step.entriesWithTime > 0 ? Math.round(step.totalTime / step.entriesWithTime) : 0,
      }));
  }

  /**
   * Get funnel summary metrics from entries
   */
  calculateFunnelMetrics(entries: EmbeddablesPageViewEntry[]): FunnelMetricsSummary {
    const total = entries.length;
    const completed = entries.filter(e => e.completed).length;
    const abandoned = total - completed;

    return {
      totalStarts: total,
      totalCompletions: completed,
      totalAbandoned: abandoned,
      conversionRate: total > 0 ? (completed / total) * 100 : 0,
      abandonmentRate: total > 0 ? (abandoned / total) * 100 : 0,
    };
  }
}

// Export singleton instance
export const embeddables = new EmbeddablesClient();

// Export standalone functions for backward compatibility
export async function fetchFunnels(): Promise<FunnelData[]> {
  try {
    const flows = await embeddables.getFlows();
    return flows.map(flow => ({
      id: flow.id,
      name: flow.name,
      totalSteps: flow.totalSteps || 0,
      steps: flow.steps || [],
    }));
  } catch (error) {
    console.error('[Embeddables] Error fetching funnels:', error);
    // Return empty array if API fails - allows dashboard to show "no data" state
    return [];
  }
}

export async function fetchFunnelAnalytics(
  funnelId: string,
  startDate: Date,
  endDate: Date
): Promise<FunnelAnalyticsData> {
  try {
    const entries = await embeddables.getEntriesPageViews(1000);
    // Filter by date range
    const filteredEntries = entries.filter(entry => {
      const entryDate = new Date(entry.createdAt);
      return entryDate >= startDate && entryDate <= endDate;
    });

    const stepAnalytics = embeddables.processPageViewsToStepAnalytics(filteredEntries);
    const metrics = embeddables.calculateFunnelMetrics(filteredEntries);

    return {
      funnelId,
      startDate,
      endDate,
      analytics: [{
        date: new Date().toISOString().split('T')[0],
        totalStarts: metrics.totalStarts,
        totalCompletions: metrics.totalCompletions,
        conversionRate: metrics.conversionRate,
      }],
      steps: stepAnalytics.map(step => ({
        stepNumber: step.stepIndex,
        stepName: step.stepName,
        entries: step.totalViews,
        exits: step.totalExits,
        continues: step.totalContinues,
        dropoffRate: step.dropOffRate,
        conversionRate: step.conversionRate,
      })),
    };
  } catch (error) {
    console.error('[Embeddables] Error fetching funnel analytics:', error);
    return {
      funnelId,
      startDate,
      endDate,
      analytics: [],
      steps: [],
    };
  }
}

// Types
export interface EmbeddablesPageViewEntry {
  entryId: string;
  flowId: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  pageViews: Array<{
    index: number;
    pageKey?: string;
    pageName?: string;
    timeSpent?: number;
    viewedAt?: string;
  }>;
  userData?: Record<string, unknown>;
}

export interface EmbeddablesEntry {
  entryId: string;
  flowId: string;
  completed: boolean;
  lastStepIndex: number;
  totalSteps: number;
  timeSpent: number;
  createdAt: string;
  updatedAt: string;
  userData?: Record<string, unknown>;
}

export interface EmbeddablesFlow {
  id: string;
  name: string;
  description?: string;
  totalSteps?: number;
  status?: string;
  steps?: Array<{
    stepNumber: number;
    stepName: string;
    stepKey?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmbeddablesAnalyticsSummary {
  totalEntries: number;
  totalCompletions: number;
  conversionRate: number;
  byDate?: Array<{
    date: string;
    entries: number;
    completions: number;
  }>;
}

export interface ProcessedStepAnalytics {
  stepKey: string;
  stepName: string;
  stepIndex: number;
  totalViews: number;
  totalExits: number;
  totalContinues: number;
  dropOffRate: number;
  conversionRate: number;
  avgTimeOnStep: number;
}

export interface FunnelMetricsSummary {
  totalStarts: number;
  totalCompletions: number;
  totalAbandoned: number;
  conversionRate: number;
  abandonmentRate: number;
}

export interface FunnelData {
  id: string;
  name: string;
  totalSteps: number;
  steps: Array<{
    stepNumber: number;
    stepName: string;
    stepKey?: string;
  }>;
}

export interface FunnelAnalyticsData {
  funnelId: string;
  startDate: Date;
  endDate: Date;
  analytics: Array<{
    date: string;
    totalStarts: number;
    totalCompletions: number;
    conversionRate: number;
  }>;
  steps: Array<{
    stepNumber: number;
    stepName: string;
    entries: number;
    exits: number;
    continues: number;
    dropoffRate: number;
    conversionRate: number;
  }>;
}
