/**
 * Slack Integration
 *
 * Handles sending alerts and daily reports to Slack via webhook
 */

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SlackMessage {
  text?: string;
  blocks?: any[];
  channel?: string;
}

interface AlertData {
  id?: string;
  funnelId: string;
  funnelName: string;
  stepNumber?: number | null;
  stepName?: string | null;
  severity: 'critical' | 'warning' | 'info';
  type: string;
  currentValue: number;
  previousDayValue?: number | null;
  sevenDayAverage?: number | null;
  percentageChange: number;
  message: string;
  recommendation?: string | null;
}

/**
 * Send message to Slack
 */
async function sendSlackMessage(message: SlackMessage): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[Slack] SLACK_WEBHOOK_URL not configured, skipping notification');
    return false;
  }

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('[Slack] Error sending message:', error);
    return false;
  }
}

/**
 * Format and send alert to Slack
 */
export async function sendAlertToSlack(alert: AlertData): Promise<boolean> {
  const emoji =
    alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
  const severityText = alert.severity.toUpperCase();

  // Calculate estimated impact
  const previousValue = alert.previousDayValue || 0;
  const additionalDropoffs = Math.round(Math.abs(alert.currentValue - previousValue) * 10);
  const estimatedRevenue = additionalDropoffs * 30; // Assuming $30 avg customer value

  const message: SlackMessage = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${severityText} ALERT`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.message}*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Funnel:*\n${alert.funnelName}`,
          },
          {
            type: 'mrkdwn',
            text: alert.stepName
              ? `*Step:*\nStep ${alert.stepNumber} - ${alert.stepName}`
              : '*Type:*\nOverall Funnel',
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Metrics:*\n• Current: ${alert.currentValue.toFixed(1)}%\n• Previous day: ${previousValue.toFixed(1)}%\n• 7-day average: ${(alert.sevenDayAverage || 0).toFixed(1)}%\n• Change: ${alert.percentageChange > 0 ? '+' : ''}${alert.percentageChange.toFixed(1)}%`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚠️ Estimated Impact:*\n• ~${additionalDropoffs} additional users affected\n• Potential revenue impact: $${estimatedRevenue.toLocaleString()}`,
        },
      },
    ],
  };

  if (alert.recommendation) {
    message.blocks?.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💡 Recommendation:*\n${alert.recommendation}`,
      },
    });
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  message.blocks?.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Dashboard',
          emoji: true,
        },
        url: `${dashboardUrl}/dashboard`,
      },
    ],
  });

  message.blocks?.push({
    type: 'divider',
  });

  return sendSlackMessage(message);
}

/**
 * Format and send daily report to Slack
 */
export async function sendDailyReportToSlack(report: {
  funnelName: string;
  reportDate: string;
  overallConversionRate: number;
  overallConversionTrend: number;
  totalFunnelStarts: number;
  totalFunnelStartsTrend: number;
  topPerformingSteps?: Array<{
    stepNumber: number;
    stepName: string;
    conversionRate: number;
  }>;
  underperformingSteps?: Array<{
    stepNumber: number;
    stepName: string;
    dropoffRate: number;
  }>;
  aiSummary?: string;
}): Promise<boolean> {
  const trendEmoji =
    report.overallConversionTrend > 0
      ? '📈'
      : report.overallConversionTrend < 0
      ? '📉'
      : '➡️';

  const message: SlackMessage = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Daily Funnel Report - ${new Date(report.reportDate).toLocaleDateString()}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Executive Summary for ${report.funnelName}*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Overall Conversion:*\n${report.overallConversionRate.toFixed(1)}% ${trendEmoji} ${report.overallConversionTrend > 0 ? '+' : ''}${report.overallConversionTrend.toFixed(1)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Total Starts:*\n${report.totalFunnelStarts.toLocaleString()} (${report.totalFunnelStartsTrend > 0 ? '+' : ''}${report.totalFunnelStartsTrend.toFixed(1)}%)`,
          },
        ],
      },
    ],
  };

  // Add top performing steps
  if (report.topPerformingSteps && report.topPerformingSteps.length > 0) {
    const topSteps = report.topPerformingSteps
      .map(
        (step) =>
          `• Step ${step.stepNumber}: ${step.stepName} (${step.conversionRate.toFixed(1)}%)`
      )
      .join('\n');

    message.blocks?.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*✅ Top Performing Steps:*\n${topSteps}`,
      },
    });
  }

  // Add underperforming steps
  if (report.underperformingSteps && report.underperformingSteps.length > 0) {
    const underSteps = report.underperformingSteps
      .map(
        (step) =>
          `• Step ${step.stepNumber}: ${step.stepName} (${step.dropoffRate.toFixed(1)}% drop-off)`
      )
      .join('\n');

    message.blocks?.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Underperforming Steps:*\n${underSteps}`,
      },
    });
  }

  // Add AI summary if available
  if (report.aiSummary) {
    message.blocks?.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🤖 AI Analysis:*\n${report.aiSummary}`,
      },
    });
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  message.blocks?.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Full Dashboard',
          emoji: true,
        },
        url: `${dashboardUrl}/dashboard`,
      },
    ],
  });

  return sendSlackMessage(message);
}

export const slack = {
  sendMessage: sendSlackMessage,
  sendAlert: sendAlertToSlack,
  sendDailyReport: sendDailyReportToSlack,
};
