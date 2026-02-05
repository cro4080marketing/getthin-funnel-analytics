/**
 * Data Sync Cron Job
 * 
 * Fetches funnel data from Embeddables API and stores in database
 * Should run every 15-30 minutes via Railway Cron or Vercel Cron
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { fetchFunnels, fetchFunnelAnalytics } from '@/lib/integrations/embeddables';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max execution

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Sync] Starting funnel data sync...');

    // Fetch all funnels from Embeddables
    const funnelsData = await fetchFunnels();
    console.log(`[Sync] Fetched ${funnelsData.length} funnels from Embeddables`);

    let recordsProcessed = 0;
    let recordsFailed = 0;

    // Process each funnel
    for (const funnelData of funnelsData) {
      try {
        // Upsert funnel record
        const funnel = await prisma.funnel.upsert({
          where: { embeddablesId: funnelData.id },
          create: {
            embeddablesId: funnelData.id,
            name: funnelData.name,
            totalSteps: funnelData.totalSteps,
            status: 'active',
            lastSyncedAt: new Date(),
          },
          update: {
            name: funnelData.name,
            totalSteps: funnelData.totalSteps,
            lastSyncedAt: new Date(),
          },
        });

        // Upsert funnel steps
        for (const stepData of funnelData.steps) {
          await prisma.funnelStep.upsert({
            where: {
              funnelId_stepNumber: {
                funnelId: funnel.id,
                stepNumber: stepData.stepNumber,
              },
            },
            create: {
              funnelId: funnel.id,
              stepNumber: stepData.stepNumber,
              stepName: stepData.stepName,
            },
            update: {
              stepName: stepData.stepName,
            },
          });
        }

        // Fetch and store analytics for last 30 days
        const endDate = endOfDay(new Date());
        const startDate = startOfDay(subDays(endDate, 30));
        
        const analyticsData = await fetchFunnelAnalytics(
          funnelData.id,
          startDate,
          endDate
        );

        // Store daily analytics
        for (const dayAnalytics of analyticsData.analytics) {
          const date = new Date(dayAnalytics.date);

          await prisma.funnelAnalytics.upsert({
            where: {
              funnelId_date_hour: {
                funnelId: funnel.id,
                date,
                hour: null,
              },
            },
            create: {
              funnelId: funnel.id,
              date,
              hour: null,
              totalStarts: dayAnalytics.totalStarts,
              totalCompletions: dayAnalytics.totalCompletions,
              totalDropoffs: dayAnalytics.totalStarts - dayAnalytics.totalCompletions,
              overallConversionRate: dayAnalytics.conversionRate,
              averageDropoffRate: 100 - dayAnalytics.conversionRate,
            },
            update: {
              totalStarts: dayAnalytics.totalStarts,
              totalCompletions: dayAnalytics.totalCompletions,
              totalDropoffs: dayAnalytics.totalStarts - dayAnalytics.totalCompletions,
              overallConversionRate: dayAnalytics.conversionRate,
              averageDropoffRate: 100 - dayAnalytics.conversionRate,
            },
          });
        }

        // Store step analytics
        const steps = await prisma.funnelStep.findMany({
          where: { funnelId: funnel.id },
        });

        for (const step of steps) {
          const stepData = analyticsData.steps.find(
            (s) => s.stepNumber === step.stepNumber
          );

          if (stepData) {
            const date = endOfDay(new Date());

            await prisma.stepAnalytics.upsert({
              where: {
                stepId_date_hour: {
                  stepId: step.id,
                  date,
                  hour: null,
                },
              },
              create: {
                stepId: step.id,
                date,
                hour: null,
                totalEntries: stepData.entries,
                totalExits: stepData.exits,
                totalContinues: stepData.continues,
                dropoffRate: stepData.dropoffRate,
                conversionRate: stepData.conversionRate,
              },
              update: {
                totalEntries: stepData.entries,
                totalExits: stepData.exits,
                totalContinues: stepData.continues,
                dropoffRate: stepData.dropoffRate,
                conversionRate: stepData.conversionRate,
              },
            });
          }
        }

        recordsProcessed++;
        console.log(`[Sync] Processed funnel: ${funnel.name}`);
      } catch (error) {
        recordsFailed++;
        console.error(`[Sync] Error processing funnel ${funnelData.id}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    // Log sync execution
    await prisma.syncLog.create({
      data: {
        syncType: 'embeddables_fetch',
        status: recordsFailed > 0 ? 'partial' : 'success',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration,
        recordsProcessed,
        recordsFailed,
      },
    });

    console.log(`[Sync] Completed in ${duration}ms - Processed: ${recordsProcessed}, Failed: ${recordsFailed}`);

    return NextResponse.json({
      success: true,
      recordsProcessed,
      recordsFailed,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed sync
    await prisma.syncLog.create({
      data: {
        syncType: 'embeddables_fetch',
        status: 'failure',
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration,
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });

    console.error('[Sync] Fatal error:', error);

    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage 
      },
      { status: 500 }
    );
  }
}
