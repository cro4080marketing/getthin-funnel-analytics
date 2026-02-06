/**
 * Embeddables Webhook Endpoint
 *
 * Receives data pushed from Embeddables Webhooks
 * Events: user.submitted.test, user.paid.test
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export const runtime = 'nodejs';

// Embeddables webhook payload - flexible to handle various event types
interface EmbeddablesWebhookPayload {
  type: string; // 'user.submitted.test', 'user.paid.test'
  data: {
    id?: string;
    entryId?: string;
    userId?: string;
    email?: string;
    flowId?: string;
    projectId?: string;
    completed?: boolean;
    currentPageIndex?: number;
    totalPages?: number;
    timeSpent?: number;
    createdAt?: string;
    updatedAt?: string;
    // Allow any additional fields
    [key: string]: unknown;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Optional: Verify webhook secret
    const webhookSecret = process.env.EMBEDDABLES_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('x-webhook-signature') ||
                       request.headers.get('webhook-secret') ||
                       request.headers.get('authorization');
      if (signature !== webhookSecret && signature !== `Bearer ${webhookSecret}`) {
        console.warn('[Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const rawPayload = await request.json();

    // Log the full payload for debugging
    console.log('[Webhook] Received payload:', JSON.stringify(rawPayload, null, 2));

    // Handle both nested {type, data} format and flat format
    const eventType = rawPayload.type || rawPayload.event || 'unknown';
    const payload = rawPayload.data || rawPayload;

    console.log(`[Webhook] Processing event: ${eventType}`);

    const projectId = payload.projectId || payload.flowId || process.env.EMBEDDABLES_PROJECT_ID;
    if (!projectId) {
      console.error('[Webhook] No projectId found in payload or environment');
      return NextResponse.json(
        { error: 'Missing projectId - configure EMBEDDABLES_PROJECT_ID or include in payload' },
        { status: 400 }
      );
    }
    const entryId = payload.entryId || payload.id || payload.userId || `entry_${Date.now()}`;

    // Get or create funnel
    let funnel = await prisma.funnel.findFirst({
      where: { embeddablesId: projectId },
    });

    if (!funnel) {
      funnel = await prisma.funnel.create({
        data: {
          embeddablesId: projectId,
          name: 'Get Thin MD Quiz',
          totalSteps: payload.totalPages || 10,
          status: 'active',
        },
      });
      console.log(`[Webhook] Created funnel: ${funnel.id}`);
    }

    // Determine if this is a completion or start based on event type
    const isSubmission = eventType === 'user.submitted.test' || eventType.includes('submitted');
    const isPaid = eventType === 'user.paid.test' || eventType.includes('paid');
    const isCompleted = isSubmission || payload.completed === true;

    // Store the entry
    await prisma.funnelEntry.upsert({
      where: { entryId: entryId },
      create: {
        entryId: entryId,
        funnelId: funnel.id,
        completed: isCompleted,
        lastStepIndex: payload.currentPageIndex || (isCompleted ? funnel.totalSteps : 0),
        totalSteps: payload.totalPages || funnel.totalSteps,
        timeSpent: payload.timeSpent || 0,
        createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
        updatedAt: new Date(),
      },
      update: {
        completed: isCompleted,
        lastStepIndex: payload.currentPageIndex || (isCompleted ? funnel.totalSteps : undefined),
        timeSpent: payload.timeSpent || undefined,
        updatedAt: new Date(),
      },
    });

    // NOTE: FunnelAnalytics is NOT updated here. The sync-data cron job is the
    // authoritative source for analytics. The webhook previously incremented
    // totalStarts by 1 per event, which caused inflated numbers when multiple
    // webhook events fired per entry. The FunnelEntry upsert above is sufficient
    // for tracking individual entries.

    console.log(`[Webhook] Successfully processed: ${eventType} for entry: ${entryId}`);

    return NextResponse.json({
      success: true,
      entryId: entryId,
      event: eventType,
      isSubmission,
      isPaid,
    });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Embeddables Webhook',
    supportedEvents: ['user.submitted.test', 'user.paid.test'],
    message: 'POST entry data to this endpoint',
  });
}
