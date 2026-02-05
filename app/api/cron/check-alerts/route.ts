/**
 * Alert Check Cron Job
 *
 * Runs alert detection and sends notifications for any anomalies.
 * Should be triggered every 15-30 minutes via external cron service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { alertDetection } from '@/lib/services/alert-detection';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute max execution

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[AlertCheck] Starting alert detection...');

    // Run alert detection
    const detectedAlerts = await alertDetection.detectAlerts();
    console.log(`[AlertCheck] Detected ${detectedAlerts.length} potential alerts`);

    // Save new alerts to database and send notifications
    const savedCount = await alertDetection.saveAlerts(detectedAlerts);
    console.log(`[AlertCheck] Saved ${savedCount} new alerts`);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      detected: detectedAlerts.length,
      saved: savedCount,
      duration,
      alerts: detectedAlerts.map((a) => ({
        funnelName: a.funnelName,
        stepNumber: a.stepNumber,
        severity: a.severity,
        type: a.type,
        message: a.message,
      })),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[AlertCheck] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      },
      { status: 500 }
    );
  }
}
