import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';

const connection = createRedisConnection();

export const QUEUE_NAMES = {
  ISSUANCE: 'certificate-issuance-queue',
  WHATSAPP: 'whatsapp-delivery-queue',
  SLA: 'batch-sla-queue',
} as const;

export const issuanceQueue = new Queue(QUEUE_NAMES.ISSUANCE, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const whatsappQueue = new Queue(QUEUE_NAMES.WHATSAPP, {
  connection,
  defaultJobOptions: {
    attempts: 8, // Retry up to 8 times with exponential backoff to handle 20% mock failures
    backoff: {
      type: 'exponential',
      delay: 500,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const slaQueue = new Queue(QUEUE_NAMES.SLA, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
