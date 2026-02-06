'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DateRangePicker, DateRange } from '@/components/dashboard/date-range-picker';
import { CustomMetricsRow, CustomMetric } from '@/components/dashboard/custom-metrics-row';
import { AreaTrendChart } from '@/components/dashboard/area-trend-chart';
import { QuickStats } from '@/components/dashboard/quick-stats';
import { VerticalFunnelChart } from '@/components/dashboard/vertical-funnel-chart';
import { FunnelFilters } from '@/components/dashboard/funnel-filters';
// CollapsibleStepGroups replaced with flat step table
import { AlertsPanel } from '@/components/dashboard/alerts-panel';
import { SettingsPanel } from '@/components/dashboard/settings-panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FUNNEL_PAGES } from '@/lib/funnel-pages';
import {
  Bell,
  RefreshCw,
  Users,
} from 'lucide-react';

interface AnalyticsData {
  totalEntries: number;
  metrics: {
    totalStarts: number;
    totalCompletions: number;
    totalAbandoned: number;
    conversionRate: number;
    abandonmentRate: number;
  };
  steps: Array<{
    stepNumber: number;
    stepName: string;
    stepKey: string;
    entries: number;
    exits: number;
    continues: number;
    conversionRate: number;
    dropOffRate: number;
    avgTimeOnStep: number;
    category: string;
  }>;
  trends: Array<{
    date: string;
    totalStarts: number;
    totalCompletions: number;
    conversionRate: number;
  }>;
}

interface AlertSummary {
  totalActive: number;
  critical: number;
  warnings: number;
}

// Custom conversion supports single stepKey or multiple stepKeys
// formula: 'sum' = add entries across keys, 'max' = take highest (avoids double-counting overlapping steps)
interface CustomConversion {
  id: string;
  name: string;
  stepKey?: string;       // Single step (backward compat)
  stepKeys?: string[];    // Multiple steps
  formula?: 'sum' | 'max'; // Default: 'sum' for backward compat; use 'max' for overlapping steps like purchases
  stepName: string;
}

// Default custom conversions (user can customize these)
const DEFAULT_CUSTOM_CONVERSIONS: CustomConversion[] = [
  { id: '1', name: 'Unique Users', stepKeys: ['current_height_and_weight'], stepName: 'Current Height and Weight' },
  { id: '2', name: 'Quiz Started', stepKeys: ['current_height_and_weight'], stepName: 'Current Height and Weight' },
  { id: '3', name: 'Lead Capture', stepKeys: ['lead_capture'], stepName: 'Lead Capture' },
  { id: '4', name: 'Checkout Viewed', stepKeys: ['macro_checkout'], stepName: 'Macro Checkout' },
  { id: '5', name: 'Purchase Complete', stepKeys: ['payment_successful', 'asnyc_confirmation_to_redirect', 'calendar_page'], formula: 'max', stepName: 'Payment Successful / Async Confirmation / Calendar Page' },
];

// Default starred steps (key conversion points)
const DEFAULT_STARRED_STEPS = [
  'current_height_and_weight',
  'lead_capture',
  'macro_checkout',
  'micro_checkout',
  'payment_successful',
];

// Default alert thresholds
const DEFAULT_ALERT_THRESHOLDS = {
  dropOffWarning: 25,
  dropOffCritical: 40,
  volumeAlert: 50,
  conversionAlert: 5,
};


export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: startOfDay(subDays(new Date(), 7)),
    endDate: endOfDay(new Date()),
    label: 'Last 7 Days',
  });
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Funnel view state
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [displayMode, setDisplayMode] = useState<'absolute' | 'percentage'>('absolute');

  // Settings state (persisted to localStorage)
  const [customConversions, setCustomConversions] = useState<typeof DEFAULT_CUSTOM_CONVERSIONS>(() => {
    if (typeof window === 'undefined') return DEFAULT_CUSTOM_CONVERSIONS;
    try {
      const saved = localStorage.getItem('funnel_custom_conversions');
      return saved ? JSON.parse(saved) : DEFAULT_CUSTOM_CONVERSIONS;
    } catch { return DEFAULT_CUSTOM_CONVERSIONS; }
  });
  const [starredSteps, setStarredSteps] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_STARRED_STEPS;
    try {
      const saved = localStorage.getItem('funnel_starred_steps');
      return saved ? JSON.parse(saved) : DEFAULT_STARRED_STEPS;
    } catch { return DEFAULT_STARRED_STEPS; }
  });
  const [alertThresholds, setAlertThresholds] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_ALERT_THRESHOLDS;
    try {
      const saved = localStorage.getItem('funnel_alert_thresholds');
      return saved ? JSON.parse(saved) : DEFAULT_ALERT_THRESHOLDS;
    } catch { return DEFAULT_ALERT_THRESHOLDS; }
  });

  // Persist settings to localStorage on change
  useEffect(() => {
    localStorage.setItem('funnel_custom_conversions', JSON.stringify(customConversions));
  }, [customConversions]);
  useEffect(() => {
    localStorage.setItem('funnel_starred_steps', JSON.stringify(starredSteps));
  }, [starredSteps]);
  useEffect(() => {
    localStorage.setItem('funnel_alert_thresholds', JSON.stringify(alertThresholds));
  }, [alertThresholds]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Send date-only strings (YYYY-MM-DD) to avoid timezone issues.
      // The API stores dates at UTC midnight, so we match using date strings.
      // Use format() (local time) not toISOString() (UTC) to get correct local dates.
      const startStr = format(dateRange.startDate, 'yyyy-MM-dd');
      const endStr = format(dateRange.endDate, 'yyyy-MM-dd');
      const analyticsRes = await fetch(
        `/api/funnels/analytics?startDate=${startStr}&endDate=${endStr}`
      );
      if (!analyticsRes.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const analyticsData = await analyticsRes.json();

      // Enrich steps with category from funnel pages
      // IMPORTANT: Use the stepKey returned by the API (from database), do NOT override it.
      // Overriding by stepNumber breaks auto-created steps (stepNumber != pageNumber for those).
      if (analyticsData.steps) {
        analyticsData.steps = analyticsData.steps.map((step: any) => {
          const pageInfo = FUNNEL_PAGES.find(p => p.pageKey === step.stepKey);
          return {
            ...step,
            category: pageInfo?.category || 'question',
          };
        });
      }

      setAnalytics(analyticsData);

      const alertsRes = await fetch('/api/alerts?status=active&limit=1');
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlertSummary(alertsData.summary);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [dateRange]);

  // Compute custom metrics for Overview
  const overviewMetrics: CustomMetric[] = useMemo(() => {
    if (!analytics?.steps) return [];

    const firstStep = analytics.steps[0];
    const totalUsers = firstStep?.entries || 0;

    return customConversions.map((conv) => {
      // Support both single stepKey and multiple stepKeys
      // formula: 'sum' = add all, 'max' = take highest (for overlapping steps)
      const keys = conv.stepKeys || (conv.stepKey ? [conv.stepKey] : []);
      const formula = conv.formula || 'sum';
      const entryCounts = keys.map(key => {
        const step = analytics.steps.find(s => s.stepKey === key);
        return step?.entries || 0;
      });
      const entries = formula === 'max'
        ? Math.max(0, ...entryCounts)
        : entryCounts.reduce((sum, c) => sum + c, 0);
      const percentage = totalUsers > 0 ? (entries / totalUsers) * 100 : 0;

      return {
        id: conv.id,
        label: conv.name,
        value: entries,
        percentage: conv.id === '1' ? undefined : percentage,
        stepKey: keys[0],
      };
    });
  }, [analytics, customConversions]);

  // Compute trend data for area chart
  const trendData = useMemo(() => {
    if (!analytics?.trends) return [];
    return analytics.trends.map(t => ({
      date: t.date,
      value: t.totalStarts,
    }));
  }, [analytics]);

  // Compute quick stats
  const quickStats = useMemo(() => {
    if (!analytics) return [];

    const criticalSteps = analytics.steps?.filter(s => s.dropOffRate > alertThresholds.dropOffCritical) || [];
    const topDropOff = [...(analytics.steps || [])].sort((a, b) => b.dropOffRate - a.dropOffRate)[0];

    return [
      {
        id: 'critical',
        icon: 'critical' as const,
        label: 'critical drop-offs',
        value: criticalSteps.length.toString(),
        variant: criticalSteps.length > 0 ? 'critical' as const : 'success' as const,
      },
      {
        id: 'conversion',
        icon: 'trend-up' as const,
        label: 'conversion rate',
        value: `${(analytics.metrics?.conversionRate || 0).toFixed(1)}%`,
        variant: (analytics.metrics?.conversionRate || 0) > 5 ? 'success' as const : 'warning' as const,
      },
      {
        id: 'top-dropoff',
        icon: 'target' as const,
        label: 'top drop-off',
        value: topDropOff?.stepName.substring(0, 20) || 'N/A',
        variant: topDropOff?.dropOffRate > 40 ? 'critical' as const : 'default' as const,
      },
    ];
  }, [analytics, alertThresholds]);

  // Prepare steps with starred info for funnel chart
  const stepsWithStarred = useMemo(() => {
    if (!analytics?.steps) return [];
    return analytics.steps.map(step => ({
      ...step,
      isStarred: starredSteps.includes(step.stepKey),
    }));
  }, [analytics, starredSteps]);

  // Available steps for settings
  const availableSteps = useMemo(() => {
    return FUNNEL_PAGES.map(p => ({
      stepKey: p.pageKey,
      stepName: p.pageName,
      stepNumber: p.pageNumber,
    }));
  }, []);

  // Mock alerts for demo
  const mockActiveAlerts = useMemo(() => {
    if (!analytics?.steps) return [];
    return analytics.steps
      .filter(s => s.dropOffRate > alertThresholds.dropOffCritical)
      .slice(0, 3)
      .map((step, i) => ({
        id: `alert-${i}`,
        type: 'drop_off' as const,
        message: `${step.stepName} drop-off at ${step.dropOffRate.toFixed(1)}%`,
        stepName: step.stepName,
        stepKey: step.stepKey,
        severity: step.dropOffRate > 50 ? 'critical' as const : 'warning' as const,
        value: step.dropOffRate,
        threshold: alertThresholds.dropOffCritical,
        triggeredAt: new Date(Date.now() - Math.random() * 86400000),
        status: 'active' as const,
      }));
  }, [analytics, alertThresholds]);

  // Custom conversion CRUD handlers
  const addConversion = useCallback((conv: Omit<CustomConversion, 'id'>) => {
    setCustomConversions(prev => [
      ...prev,
      { ...conv, id: String(Date.now()) },
    ]);
  }, []);

  const editConversion = useCallback((id: string, conv: Omit<CustomConversion, 'id'>) => {
    setCustomConversions(prev =>
      prev.map(c => c.id === id ? { ...c, ...conv } : c)
    );
  }, []);

  const removeConversion = useCallback((id: string) => {
    setCustomConversions(prev => prev.filter(c => c.id !== id));
  }, []);

  const toggleStarredStep = (stepKey: string) => {
    setStarredSteps(prev =>
      prev.includes(stepKey)
        ? prev.filter(k => k !== stepKey)
        : [...prev, stepKey]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Get Thin MD Analytics
              </h1>
              {lastUpdated && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {alertSummary && alertSummary.totalActive > 0 && (
                <Button
                  variant="outline"
                  className="relative"
                  onClick={() => setActiveTab('alerts')}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Alerts
                  <Badge
                    variant={alertSummary.critical > 0 ? 'critical' : 'warning'}
                    className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {alertSummary.totalActive}
                  </Badge>
                </Button>
              )}

              <DateRangePicker value={dateRange} onChange={setDateRange} />

              <Button
                variant="outline"
                size="icon"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="funnel">Funnel</TabsTrigger>
              <TabsTrigger value="alerts">
                Alerts
                {mockActiveAlerts.length > 0 && (
                  <Badge variant="critical" className="ml-1.5 h-5 min-w-[20px] px-1">
                    {mockActiveAlerts.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            {/* Custom Metrics Row */}
            <CustomMetricsRow
              metrics={overviewMetrics}
              loading={loading}
              onAddMetric={() => setActiveTab('settings')}
            />

            {/* Area Trend Chart */}
            <div className="rounded-lg border bg-white p-6">
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900">Traffic Trend</h3>
                <p className="text-sm text-gray-500">Daily funnel starts over time</p>
              </div>
              <AreaTrendChart
                data={trendData}
                loading={loading}
                valueLabel="Users"
              />
            </div>

            {/* Quick Stats */}
            <QuickStats stats={quickStats} loading={loading} />

            {/* No Data State */}
            {!loading && !error && (!analytics || analytics.totalEntries === 0) && (
              <div className="text-center py-12 bg-white rounded-lg border">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No data available</h3>
                <p className="text-gray-500 mt-2 max-w-md mx-auto">
                  Connect your Embeddables API key to start monitoring your funnels.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Funnel Tab */}
          <TabsContent value="funnel" className="mt-0 space-y-6">
            {/* Filters */}
            <FunnelFilters
              showStarredOnly={showStarredOnly}
              onShowStarredOnlyChange={setShowStarredOnly}
              displayMode={displayMode}
              onDisplayModeChange={setDisplayMode}
              onRefresh={fetchData}
              loading={loading}
            />

            {/* Vertical Funnel Chart */}
            <VerticalFunnelChart
              steps={stepsWithStarred}
              loading={loading}
              showStarredOnly={showStarredOnly}
              displayMode={displayMode}
            />

            {/* Flat Step-by-Step Breakdown (in flow order) */}
            {!loading && stepsWithStarred.length > 0 && (
              <div className="rounded-lg border bg-white overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-900">Step-by-Step Breakdown</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Steps in funnel flow order</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-gray-600">
                        <th className="text-left px-4 py-2 font-medium">#</th>
                        <th className="text-left px-4 py-2 font-medium">Step</th>
                        <th className="text-right px-4 py-2 font-medium">Contacts</th>
                        <th className="text-right px-4 py-2 font-medium">Drop-off</th>
                        <th className="text-right px-4 py-2 font-medium">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showStarredOnly ? stepsWithStarred.filter(s => s.isStarred) : stepsWithStarred)
                        .map((step, idx) => {
                          const totalUsers = stepsWithStarred[0]?.entries || 1;
                          const pctTotal = ((step.entries / totalUsers) * 100).toFixed(1);
                          return (
                            <tr key={step.stepKey} className="border-b last:border-b-0 hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-900">{step.stepName}</td>
                              <td className="px-4 py-2.5 text-right text-gray-900">{step.entries.toLocaleString()}</td>
                              <td className={`px-4 py-2.5 text-right font-medium ${
                                step.dropOffRate > 40 ? 'text-red-600' :
                                step.dropOffRate > 25 ? 'text-amber-600' : 'text-gray-600'
                              }`}>
                                {step.dropOffRate.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right text-gray-600">{pctTotal}%</td>
                            </tr>
                          );
                        })
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="mt-0">
            <AlertsPanel
              activeAlerts={mockActiveAlerts}
              alertHistory={[]}
              loading={loading}
              onConfigureRules={() => setActiveTab('settings')}
            />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-0">
            <SettingsPanel
              customConversions={customConversions}
              starredSteps={starredSteps}
              alertThresholds={alertThresholds}
              availableSteps={availableSteps}
              onAddConversion={addConversion}
              onEditConversion={editConversion}
              onRemoveConversion={removeConversion}
              onToggleStarredStep={toggleStarredStep}
              onUpdateThresholds={setAlertThresholds}
              onSyncComplete={fetchData}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
