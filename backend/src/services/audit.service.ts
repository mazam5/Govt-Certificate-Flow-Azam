import { prisma } from '../config/prisma.js';
import { sseHub } from '../events/sse.js';

export interface AuditLogInput {
  actorId: string;
  actorName: string;
  role: string;
  action: string;
  targetType: 'BATCH' | 'CERTIFICATE' | 'APPROVAL' | 'SLA';
  targetId: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  public static async log(input: AuditLogInput) {
    try {
      const record = await prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          actorName: input.actorName,
          role: input.role,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          timestamp: new Date(),
        },
      });

      // Broadcast audit event to SSE stream
      sseHub.broadcast('AUDIT_LOG_ENTRY', {
        id: record.id,
        actorId: record.actorId,
        actorName: record.actorName,
        role: record.role,
        action: record.action,
        targetType: record.targetType,
        targetId: record.targetId,
        metadata: input.metadata || null,
        timestamp: record.timestamp,
      });

      return record;
    } catch (error) {
      console.error('Failed to write immutable audit log:', error);
      throw error;
    }
  }

  public static async getLogsForTarget(targetId: string) {
    const logs = await prisma.auditLog.findMany({
      where: { targetId },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));
  }

  public static async getRecentLogs(limit = 50) {
    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));
  }
}
