'use client';

import { useState, useEffect } from 'react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { MetricsCard } from '@/components/dashboard/metrics-card';
import { StepBreakdown } from '@/components/dashboard/step-breakdown';
import { DateRangePicker, DateRange } from '@/components/dashboard/date-range-picker';
import { FunnelChart } from '@/components/dashboard/funnel-chart';
import { TrendChart } from '@/components/dashboard/trend-chart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Target,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Bell,
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
    entries: number;
    exits: number;
    continues: number;
    conversionRate: number;
    dropOffRate: number;
    avgTimeOnStep: number;
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

export default function DashboardPage() {
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

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch analytics from Embeddables
      const analyticsRes = await fetch('/api/funnels/analytics?limit=1000');
      if (!analyticsRes.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const analyticsData = await analyticsRes.json();
      setAnalytics(analyticsData);

      // Fetch alerts summary
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
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [dateRange]);

  const criticalSteps = analytics?.steps.filter((s) => s.dropOffRate > 40) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Get Thin MD - Funnel Analytics
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Real-time monitoring and insights for medical questionnaire funnels
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Alert Badge */}
              {alertSummary && alertSummary.totalActive > 0 && (
                <Button variant="outline" className="relative">
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
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-2">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-medium">Error loading data</p>
            </div>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={fetchData}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricsCard
            title="Total Funnel Starts"
            value={analytics?.metrics.totalStarts || 0}
            format="number"
            icon={<Users className="h-5 w-5" />}
          />
          <MetricsCard
            title="Completions"
            value={analytics?.metrics.totalCompletions || 0}
            format="number"
            icon={<Target className="h-5 w-5" />}
          />
          <MetricsCard
            title="Conversion Rate"
            value={analytics?.metrics.conversionRate || 0}
            format="percentage"
            icon={<TrendingDown className="h-5 w-5 rotate-180" />}
          />
          <MetricsCard
            title="Critical Steps"
            value={criticalSteps.length}
            format="number"
            icon={<AlertTriangle className="h-5 w-5" />}
            reverseColors
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <FunnelChart
            steps={
              analytics?.steps.map((s) => ({
                stepNumber: s.stepNumber,
                stepName: s.stepName,
                entries: s.entries,
                conversionRate: s.conversionRate,
                dropOffRate: s.dropOffRate,
              })) || []
            }
            loading={loading}
          />
          <TrendChart
            data={
              analytics?.trends.map((t) => ({
                date: t.date,
                conversionRate: t.conversionRate,
              })) || []
            }
            loading={loading}
          />
        </div>

        {/* Step Breakdown Table */}
        <StepBreakdown
          steps={
            analytics?.steps.map((s) => ({
              stepNumber: s.stepNumber,
              stepName: s.stepName,
              entries: s.entries,
              exits: s.exits,
              conversionRate: s.conversionRate,
              dropOffRate: s.dropOffRate,
              avgTimeOnStep: s.avgTimeOnStep,
            })) || []
          }
          loading={loading}
        />

        {/* No Data State */}
        {!loading && !error && (!analytics || analytics.totalEntries === 0) && (
          <div className="mt-8 text-center py-12 bg-white rounded-lg border">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No data available</h3>
            <p className="text-gray-500 mt-2 max-w-md mx-auto">
              Connect your Embeddables API key to start monitoring your funnels.
              Make sure your EMBEDDABLES_API_KEY environment variable is set.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
