import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export function correlationLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const actorId = req.user?.id || 'anonymous';
    const role = req.user?.role || 'PUBLIC';

    // Only log if not health check
    if (req.path !== '/health') {
      logger.info({
        correlationId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: duration,
        actorId,
        role,
      }, `HTTP ${req.method} ${req.path} completed with ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
}
