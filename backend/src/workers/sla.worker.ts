import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queues.js';
import { createRedisConnection } from '../config/redis.js';
import { SlaService } from '../services/sla.service.js';

export const slaWorker = new Worker(
  QUEUE_NAMES.SLA,
  async (job: Job) => {
    const { batchId, version, targetState } = job.data;
    console.log(`⏱️ [SlaWorker] Evaluating SLA expiration for batch ${batchId} [State: ${targetState}, v${version}]`);

    const escalated = await SlaService.handleSlaExpiration({
      batchId,
      version,
      targetState,
    });

    return { batchId, escalated };
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  }
);
