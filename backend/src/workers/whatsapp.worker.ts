import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queues.js';
import { createRedisConnection } from '../config/redis.js';
import { prisma } from '../config/prisma.js';
import { sseHub } from '../events/sse.js';
import { DeliveryStatus } from '@prisma/client';

/**
 * Stand-in Mock WhatsApp Gateway:
 * - Simulates realistic network latency (100-300ms)
 * - Simulates 20% random failures/timeouts
 * - BullMQ will retry with exponential backoff until 100% of candidates succeed
 */
async function mockSendWhatsAppApi(phone: string, candidateName: string, certNumber: string): Promise<{ messageId: string }> {
  // 1. Realistic network latency: 100ms - 300ms
  const latency = Math.floor(Math.random() * 200) + 100;
  await new Promise((r) => setTimeout(r, latency));

  // 2. 20% random failure simulation
  const random = Math.random();
  if (random < 0.20) {
    if (random < 0.10) {
      throw new Error(`WhatsApp Gateway Error: Timeout sending to +91-${phone} after ${latency}ms`);
    } else {
      throw new Error(`WhatsApp API Error 503: Service temporarily overloaded. Retrying...`);
    }
  }

  return {
    messageId: `wa_msg_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
  };
}

export const whatsappWorker = new Worker(
  QUEUE_NAMES.WHATSAPP,
  async (job: Job) => {
    const { certificateId, certNumber, candidateId, candidateName, phone, batchId } = job.data;
    const attempt = job.attemptsMade + 1;

    console.log(`📱 [WhatsAppWorker] Sending cert ${certNumber} to ${candidateName} (+91-${phone}) [Attempt ${attempt}]`);

    try {
      // Stand-in WhatsApp API call
      await mockSendWhatsAppApi(phone, candidateName, certNumber);

      // Succeeded: update DB status
      await prisma.deliveryLog.upsert({
        where: { candidateId },
        update: {
          status: DeliveryStatus.DELIVERED,
          attempts: attempt,
          lastAttemptAt: new Date(),
          deliveredAt: new Date(),
          errorMessage: null,
        },
        create: {
          certificateId,
          candidateId,
          phone,
          status: DeliveryStatus.DELIVERED,
          attempts: attempt,
          lastAttemptAt: new Date(),
          deliveredAt: new Date(),
        },
      });

      // Count delivered candidates for this batch to broadcast real-time progress
      const totalCandidates = await prisma.candidate.count({ where: { batchId } });
      const deliveredCount = await prisma.deliveryLog.count({
        where: {
          candidate: { batchId },
          status: DeliveryStatus.DELIVERED,
        },
      });

      sseHub.broadcast('WHATSAPP_DELIVERY_PROGRESS', {
        batchId,
        candidateId,
        candidateName,
        certNumber,
        status: 'DELIVERED',
        attempt,
        deliveredCount,
        totalCandidates,
        percentage: Math.round((deliveredCount / totalCandidates) * 100),
      });

      return { success: true, attempt };
    } catch (error: any) {
      // Failed: record attempt & error
      await prisma.deliveryLog.upsert({
        where: { candidateId },
        update: {
          status: DeliveryStatus.FAILED,
          attempts: attempt,
          lastAttemptAt: new Date(),
          errorMessage: error.message,
        },
        create: {
          certificateId,
          candidateId,
          phone,
          status: DeliveryStatus.FAILED,
          attempts: attempt,
          lastAttemptAt: new Date(),
          errorMessage: error.message,
        },
      });

      sseHub.broadcast('WHATSAPP_DELIVERY_RETRY', {
        batchId,
        candidateName,
        phone,
        attempt,
        error: error.message,
      });

      // Rethrow to let BullMQ handle exponential backoff retry!
      throw error;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 10,
  }
);
