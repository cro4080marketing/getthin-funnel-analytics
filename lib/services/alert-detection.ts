/**
 * Alert Detection Service
 *
 * Monitors funnel metrics and generates alerts when anomalies are detected.
 * Based on the thresholds defined in the context document:
 * - Drop-off rate increase >15% vs previous day
 * - Drop-off rate increase >10% vs 7-day average
 * - Conversion rate drop >20% vs previous day
 * - Volume decrease >30% vs previous day
 */

import prisma from '@/lib/db/prisma';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { sendAlertToSlack } from '@/lib/integrations/slack';

export interface AlertConfig {
  dropOffRateThresholdVsPrevDay: number; // default 15%
  dropOffRateThresholdVs7Day: number; // default 10%
  conversionDropThresholdVsPrevDay: number; // default 20%
  volumeDropThresholdVsPrevDay: number; // default 30%
  criticalDropOffThreshold: number; // default 50%
  warningDropOffThreshold: number; // default 30%
}

const DEFAULT_CONFIG: AlertConfig = {
  dropOffRateThresholdVsPrevDay: 15,
  dropOffRateThresholdVs7Day: 10,
  conversionDropThresholdVsPrevDay: 20,
  volumeDropThresholdVsPrevDay: 30,
  criticalDropOffThreshold: 50,
  warningDropOffThreshold: 30,
};

export interface DetectedAlert {
  funnelId: string;
  funnelName: string;
  stepNumber?: number;
  stepName?: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'drop_off' | 'conversion' | 'volume' | 'step_anomaly';
  currentValue: number;
  previousDayValue?: number;
  sevenDayAverage?: number;
  percentageChange: number;
  message: string;
  recommendation?: string;
}

export class AlertDetectionService {
  private config: AlertConfig;

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run alert detection for all funnels
   */
  async detectAlerts(): Promise<DetectedAlert[]> {
    const alerts: DetectedAlert[] = [];
    const today = endOfDay(new Date());
    const yesterday = startOfDay(subDays(today, 1));
    const sevenDaysAgo = startOfDay(subDays(today, 7));

    // Get all active funnels
    const funnels = await prisma.funnel.findMany({
      where: { status: 'active' },
      include: {
        steps: {
          include: {
            analytics: {
              where: {
                date: {
                  gte: sevenDaysAgo,
                  lte: today,
                },
              },
              orderBy: { date: 'desc' },
            },
          },
          orderBy: { stepNumber: 'asc' },
        },
        analytics: {
          where: {
            date: {
              gte: sevenDaysAgo,
              lte: today,
            },
          },
          orderBy: { date: 'desc' },
        },
      },
    });

    for (const funnel of funnels) {
      // Check funnel-level metrics
      const funnelAlerts = this.checkFunnelMetrics(funnel);
      alerts.push(...funnelAlerts);

      // Check step-level metrics
      for (const step of funnel.steps) {
        const stepAlerts = this.checkStepMetrics(funnel, step);
        alerts.push(...stepAlerts);
      }
    }

    return alerts;
  }

  /**
   * Check funnel-level metrics for anomalies
   */
  private checkFunnelMetrics(funnel: any): DetectedAlert[] {
    const alerts: DetectedAlert[] = [];
    const analytics = funnel.analytics;

    if (analytics.length < 2) return alerts;

    const todayAnalytics = analytics[0];
    const yesterdayAnalytics = analytics[1];

    // Get 7-day average
    const last7Days = analytics.slice(0, 7);
    const avgConversionRate =
      last7Days.reduce((sum: number, a: any) => sum + a.conversionRate, 0) /
      last7Days.length;
    const avgVolume =
      last7Days.reduce((sum: number, a: any) => sum + a.totalStarts, 0) /
      last7Days.length;

    // Check conversion rate drop vs previous day
    if (yesterdayAnalytics.conversionRate > 0) {
      const conversionChange =
        ((todayAnalytics.conversionRate - yesterdayAnalytics.conversionRate) /
          yesterdayAnalytics.conversionRate) *
        100;

      if (conversionChange < -this.config.conversionDropThresholdVsPrevDay) {
        alerts.push({
          funnelId: funnel.id,
          funnelName: funnel.name,
          severity: conversionChange < -30 ? 'critical' : 'warning',
          type: 'conversion',
          currentValue: todayAnalytics.conversionRate,
          previousDayValue: yesterdayAnalytics.conversionRate,
          sevenDayAverage: avgConversionRate,
          percentageChange: conversionChange,
          message: `Conversion rate dropped by ${Math.abs(conversionChange).toFixed(1)}% vs yesterday`,
          recommendation:
            'Review recent changes to the funnel. Check for technical issues or UX problems.',
        });
      }
    }

    // Check volume drop vs previous day
    if (yesterdayAnalytics.totalStarts > 0) {
      const volumeChange =
        ((todayAnalytics.totalStarts - yesterdayAnalytics.totalStarts) /
          yesterdayAnalytics.totalStarts) *
        100;

      if (volumeChange < -this.config.volumeDropThresholdVsPrevDay) {
        alerts.push({
          funnelId: funnel.id,
          funnelName: funnel.name,
          severity: volumeChange < -50 ? 'critical' : 'warning',
          type: 'volume',
          currentValue: todayAnalytics.totalStarts,
          previousDayValue: yesterdayAnalytics.totalStarts,
          sevenDayAverage: avgVolume,
          percentageChange: volumeChange,
          message: `Funnel starts decreased by ${Math.abs(volumeChange).toFixed(1)}% vs yesterday`,
          recommendation:
            'Check traffic sources and marketing campaigns. Verify funnel embed is working correctly.',
        });
      }
    }

    return alerts;
  }

  /**
   * Check step-level metrics for anomalies
   */
  private checkStepMetrics(funnel: any, step: any): DetectedAlert[] {
    const alerts: DetectedAlert[] = [];
    const analytics = step.analytics;

    if (analytics.length < 2) return alerts;

    const todayAnalytics = analytics[0];
    const yesterdayAnalytics = analytics[1];

    // Get 7-day average
    const last7Days = analytics.slice(0, 7);
    const avgDropOffRate =
      last7Days.reduce((sum: number, a: any) => sum + a.dropOffRate, 0) /
      last7Days.length;

    // Check drop-off rate increase vs previous day
    if (yesterdayAnalytics.dropOffRate > 0) {
      const dropOffChange =
        ((todayAnalytics.dropOffRate - yesterdayAnalytics.dropOffRate) /
          yesterdayAnalytics.dropOffRate) *
        100;

      if (dropOffChange > this.config.dropOffRateThresholdVsPrevDay) {
        const severity = this.getSeverity(todayAnalytics.dropOffRate, dropOffChange);

        alerts.push({
          funnelId: funnel.id,
          funnelName: funnel.name,
          stepNumber: step.stepNumber,
          stepName: step.stepName,
          severity,
          type: 'drop_off',
          currentValue: todayAnalytics.dropOffRate,
          previousDayValue: yesterdayAnalytics.dropOffRate,
          sevenDayAverage: avgDropOffRate,
          percentageChange: dropOffChange,
          message: `Drop-off rate at Step ${step.stepNumber} (${step.stepName}) increased by ${dropOffChange.toFixed(1)}%`,
          recommendation: this.getRecommendation(step.stepName, todayAnalytics.dropOffRate),
        });
      }
    }

    // Check drop-off rate increase vs 7-day average
    if (avgDropOffRate > 0) {
      const dropOffChangeVs7Day =
        ((todayAnalytics.dropOffRate - avgDropOffRate) / avgDropOffRate) * 100;

      if (
        dropOffChangeVs7Day > this.config.dropOffRateThresholdVs7Day &&
        !alerts.some(
          (a) =>
            a.funnelId === funnel.id &&
            a.stepNumber === step.stepNumber &&
            a.type === 'drop_off'
        )
      ) {
        const severity = this.getSeverity(todayAnalytics.dropOffRate, dropOffChangeVs7Day);

        alerts.push({
          funnelId: funnel.id,
          funnelName: funnel.name,
          stepNumber: step.stepNumber,
          stepName: step.stepName,
          severity,
          type: 'step_anomaly',
          currentValue: todayAnalytics.dropOffRate,
          sevenDayAverage: avgDropOffRate,
          percentageChange: dropOffChangeVs7Day,
          message: `Step ${step.stepNumber} (${step.stepName}) drop-off is ${dropOffChangeVs7Day.toFixed(1)}% above 7-day average`,
          recommendation: this.getRecommendation(step.stepName, todayAnalytics.dropOffRate),
        });
      }
    }

    return alerts;
  }

  /**
   * Determine alert severity based on metrics
   */
  private getSeverity(
    dropOffRate: number,
    percentageChange: number
  ): 'critical' | 'warning' | 'info' {
    if (
      dropOffRate > this.config.criticalDropOffThreshold ||
      percentageChange > 50
    ) {
      return 'critical';
    }
    if (
      dropOffRate > this.config.warningDropOffThreshold ||
      percentageChange > 25
    ) {
      return 'warning';
    }
    return 'info';
  }

  /**
   * Generate contextual recommendations based on step type
   */
  private getRecommendation(stepName: string, dropOffRate: number): string {
    const lowerName = stepName.toLowerCase();

    if (lowerName.includes('medical') || lowerName.includes('history')) {
      return 'Medical history steps often see high drop-offs. Consider progressive disclosure or simplifying questions.';
    }
    if (lowerName.includes('insurance')) {
      return 'Insurance steps can cause friction. Add trust badges and clarify why information is needed.';
    }
    if (lowerName.includes('payment') || lowerName.includes('checkout')) {
      return 'Check for payment processing issues. Ensure trust signals are visible and checkout is mobile-friendly.';
    }
    if (lowerName.includes('bmi') || lowerName.includes('weight')) {
      return 'BMI/weight steps can be sensitive. Consider hiding calculations and showing encouraging messages.';
    }
    if (dropOffRate > 40) {
      return 'High drop-off detected. Review form complexity, validation errors, and mobile experience.';
    }

    return 'Review recent changes to this step. Check for validation issues or confusing UX.';
  }

  /**
   * Save detected alerts to database
   */
  async saveAlerts(alerts: DetectedAlert[]): Promise<number> {
    let savedCount = 0;

    for (const alert of alerts) {
      // Check if similar alert already exists (within last 24 hours)
      const existingAlert = await prisma.alert.findFirst({
        where: {
          funnelId: alert.funnelId,
          stepNumber: alert.stepNumber,
          type: alert.type,
          status: 'active',
          createdAt: {
            gte: subDays(new Date(), 1),
          },
        },
      });

      if (!existingAlert) {
        await prisma.alert.create({
          data: {
            funnelId: alert.funnelId,
            stepNumber: alert.stepNumber,
            severity: alert.severity,
            type: alert.type,
            currentValue: alert.currentValue,
            previousDayValue: alert.previousDayValue,
            sevenDayAverage: alert.sevenDayAverage,
            percentageChange: alert.percentageChange,
            message: alert.message,
            recommendation: alert.recommendation,
            status: 'active',
          },
        });
        savedCount++;

        // Send to Slack for critical/warning alerts
        if (alert.severity === 'critical' || alert.severity === 'warning') {
          try {
            await sendAlertToSlack(alert);
          } catch (error) {
            console.error('[AlertDetection] Failed to send Slack alert:', error);
          }
        }
      }
    }

    return savedCount;
  }
}

export const alertDetection = new AlertDetectionService();
