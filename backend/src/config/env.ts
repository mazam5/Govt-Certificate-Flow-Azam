import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://certiflow:certiflow_secret@localhost:5432/certiflow?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  slaTimeoutMs: parseInt(process.env.SLA_TIMEOUT_MS || '15000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  certificateStoragePath: process.env.CERTIFICATE_STORAGE_PATH || path.resolve(process.cwd(), 'storage/certificates'),
};
