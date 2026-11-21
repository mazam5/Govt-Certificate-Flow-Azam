import { slaQueue, QUEUE_NAMES } from '../queues/queues.js';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { AuditService } from './audit.service.js';
import { sseHub } from '../events/sse.js';
import { BatchStatus } from '@prisma/client';

export class SlaService {
  /**
   * Schedule SLA escalation delayed job for a batch entering a review state
   */
  public static async scheduleSla(
    batchId: string,
    version: number,
    targetState: BatchStatus,
    timeoutMs: number = config.slaTimeoutMs
  ): Promise<string> {
    const jobId = `sla:${batchId}:v${version}:${targetState}`;

    // Remove existing job if any
    try {
      const existingJob = await slaQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
      }
    } catch (err) {
      // Ignore cleanup error
    }

    await slaQueue.add(
      'check-batch-sla',
      {
        batchId,
        version,
        targetState,
        scheduledAt: new Date().toISOString(),
      },
      {
        jobId,
        delay: timeoutMs,
      }
    );

    return jobId;
  }

  /**
   * Cancel pending SLA job when state advances or changes are requested
   */
  public static async cancelSla(batchId: string, version: number, state: BatchStatus): Promise<void> {
    const jobId = `sla:${batchId}:v${version}:${state}`;
    try {
      const job = await slaQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      // Silently handle if not found
    }
  }

  /**
   * Called by BullMQ SLA worker when the timer expires
   */
  public static async handleSlaExpiration(data: {
    batchId: string;
    version: number;
    targetState: BatchStatus;
  }): Promise<boolean> {
    const { batchId, version, targetState } = data;

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { centre: true },
    });

    if (!batch) {
      return false;
    }

    // Only escalate if batch is still untouched in the exact state and version
    if (batch.status === targetState && batch.version === version) {
      const updated = await prisma.batch.update({
        where: { id: batchId },
        data: {
          status: BatchStatus.ESCALATED,
        },
      });

      // Write immutable audit log
      await AuditService.log({
        actorId: 'system-sla-monitor',
        actorName: 'SLA Escalation Service',
        role: 'SYSTEM',
        action: 'BATCH_SLA_BREACH_ESCALATED',
        targetType: 'SLA',
        targetId: batchId,
        metadata: {
          batchNumber: batch.batchNumber,
          breachedState: targetState,
          version,
          district: batch.centre.district,
          totalCandidates: batch.totalCandidates,
        },
      });

      // Broadcast real-time alert to Farah and stakeholders
      sseHub.broadcast('SLA_ESCALATED_ALERT', {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        district: batch.centre.district,
        state: targetState,
        totalCandidates: batch.totalCandidates,
        message: `⚠️ Batch ${batch.batchNumber} has breached review SLA in state [${targetState}]. Escalated to State Office!`,
      });

      return true;
    }

    return false;
  }
}
