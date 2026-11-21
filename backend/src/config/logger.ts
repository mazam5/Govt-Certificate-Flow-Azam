import pino from 'pino';
import { config } from './env.js';

export const logger = pino({
  level: config.nodeEnv === 'test' ? 'silent' : 'info',
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    service: 'certiflow-backend',
    env: config.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createCorrelationLogger(context: {
  correlationId?: string;
  batchId?: string;
  certificateNumber?: string;
  actorId?: string;
  role?: string;
}) {
  return logger.child(context);
}
