import Redis from 'ioredis';
import { config } from './env.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  // Only log if not in silent test mode
  if (config.nodeEnv !== 'test') {
    console.error('⚠️ Redis connection error:', err.message);
  }
});

redis.on('connect', () => {
  if (config.nodeEnv !== 'test') {
    console.log('✅ Connected to Redis cache & queue store');
  }
});

export function createRedisConnection(): Redis {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
  });
}
