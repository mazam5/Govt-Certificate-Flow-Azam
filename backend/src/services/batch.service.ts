import { BatchStatus, ReviewLevel, Role, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedUser } from '../middleware/auth.js';
import { AuditService } from './audit.service.js';
import { SlaService } from './sla.service.js';
import { sseHub } from '../events/sse.js';
import { issuanceQueue } from '../queues/queues.js';
import { ValidatedCandidate } from './spreadsheet.service.js';

export class BatchService {
  /**
   * Create a new batch with candidates in a single atomic database transaction
   */
  public static async createBatchWithCandidates(
    user: AuthenticatedUser,
    data: {
      courseName: string;
      candidates: ValidatedCandidate[];
    }
  ) {
    if (!user.centreId) {
      throw new AppError('Only training centre personas can upload batches.', 403);
    }

    const centre = await prisma.trainingCentre.findUnique({
      where: { id: user.centreId },
    });

    if (!centre) {
      throw new AppError('Training centre not found.', 404);
    }

    const batchCount = await prisma.batch.count({
      where: { centreId: centre.id },
    });
    const batchNumber = `${centre.code}-B${String(batchCount + 1).padStart(3, '0')}`;

    // Execute atomic creation transaction
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          batchNumber,
          centreId: centre.id,
          courseName: data.courseName,
          totalCandidates: data.candidates.length,
          status: BatchStatus.DRAFT,
          currentReviewLevel: ReviewLevel.DISTRICT,
          version: 1,
        },
      });

      // Insert all candidate records atomically
      const candidateRecords = data.candidates.map((c) => ({
        batchId: batch.id,
        name: c.name,
        fatherName: c.fatherName,
        dateOfBirth: c.dateOfBirth,
        gender: c.gender,
        aadharLast4: c.aadharLast4,
        phone: c.phone,
        course: c.course || data.courseName,
        grade: c.grade,
        completionDate: c.completionDate,
      }));

      await tx.candidate.createMany({
        data: candidateRecords,
      });

      return batch;
    });

    // Immutable Audit Log
    await AuditService.log({
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: 'BATCH_CREATED',
      targetType: 'BATCH',
      targetId: result.id,
      metadata: {
        batchNumber: result.batchNumber,
        totalCandidates: result.totalCandidates,
        courseName: result.courseName,
      },
    });

    sseHub.broadcast('BATCH_CREATED', {
      batchId: result.id,
      batchNumber: result.batchNumber,
      totalCandidates: result.totalCandidates,
    });

    return result;
  }

  /**
   * Submit batch from DRAFT or CHANGES_REQUESTED to SUBMITTED
   */
  public static async submitBatch(batchId: string, user: AuthenticatedUser) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { centre: true },
    });

    if (!batch) {
      throw new AppError('Batch not found.', 404);
    }

    if (user.role === Role.TRAINING_CENTRE && user.centreId && batch.centreId !== user.centreId) {
      throw new AppError('Forbidden: Training Centre can only submit batches belonging to their centre.', 403);
    }

    if (batch.status !== BatchStatus.DRAFT && batch.status !== BatchStatus.CHANGES_REQUESTED) {
      throw new AppError(`Cannot submit batch currently in ${batch.status} state.`, 400);
    }

    const updated = await prisma.batch.update({
      where: { id: batchId },
      data: {
        status: BatchStatus.SUBMITTED,
        currentReviewLevel: ReviewLevel.DISTRICT,
        rejectionReason: null,
        rejectedBy: null,
      },
    });

    // Schedule SLA job for District Officers
    await SlaService.scheduleSla(batch.id, updated.version, BatchStatus.SUBMITTED);

    await AuditService.log({
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: 'BATCH_SUBMITTED_FOR_REVIEW',
      targetType: 'BATCH',
      targetId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        version: updated.version,
        totalCandidates: batch.totalCandidates,
      },
    });

    sseHub.broadcast('BATCH_STATUS_UPDATED', {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      status: BatchStatus.SUBMITTED,
      currentReviewLevel: ReviewLevel.DISTRICT,
      version: updated.version,
    });

    return updated;
  }

  /**
   * Review & Approve Batch with PostgreSQL concurrency locking & transaction safety
   */
  public static async approveBatch(
    batchId: string,
    user: AuthenticatedUser,
    comments?: string
  ) {
    // Run within a serializable/isolated transaction with row locking
    const transitionResult = await prisma.$transaction(async (tx) => {
      // 1. Lock batch row for update (Postgres row-level lock)
      let batch: any;
      try {
        const lockedRows: any[] = await tx.$queryRaw`
          SELECT b.*, c.district as "centreDistrict" 
          FROM "Batch" b 
          JOIN "TrainingCentre" c ON b."centreId" = c.id 
          WHERE b.id = ${batchId} 
          FOR UPDATE
        `;
        if (!lockedRows || lockedRows.length === 0) {
          throw new AppError('Batch not found.', 404);
        }
        batch = lockedRows[0];
      } catch (err: any) {
        // Fallback for mock/sqlite during dev/tests if queryRaw syntax differs
        batch = await tx.batch.findUnique({
          where: { id: batchId },
          include: { centre: true },
        });
        if (!batch) throw new AppError('Batch not found.', 404);
      }

      const centreDistrict = batch.centreDistrict || batch.centre?.district;

      // ==========================================
      // STAGE 1: DISTRICT OFFICER APPROVAL
      // ==========================================
      if (user.role === Role.DISTRICT_OFFICER) {
        if (batch.status !== BatchStatus.SUBMITTED && batch.status !== BatchStatus.ESCALATED) {
          throw new AppError(`District officers can only approve batches in SUBMITTED state. Current state: ${batch.status}`, 400);
        }

        if (user.district !== centreDistrict) {
          throw new AppError(`Officer district mismatch: You are from ${user.district}, but batch belongs to ${centreDistrict}.`, 403);
        }

        // Check if this officer has already approved this version
        const existingApproval = await tx.batchApproval.findFirst({
          where: {
            batchId: batch.id,
            officerId: user.id,
            version: batch.version,
            level: 'DISTRICT',
            status: 'APPROVED',
          },
        });

        if (existingApproval) {
          throw new AppError('You have already approved this batch for current version.', 400);
        }

        // Record the officer's approval
        await tx.batchApproval.create({
          data: {
            batchId: batch.id,
            officerId: user.id,
            officerName: user.name,
            role: user.role,
            level: 'DISTRICT',
            version: batch.version,
            status: 'APPROVED',
            comments: comments || 'District approval granted',
          },
        });

        // Count distinct district approvals for this batch version
        const currentApprovals = await tx.batchApproval.findMany({
          where: {
            batchId: batch.id,
            version: batch.version,
            level: 'DISTRICT',
            status: 'APPROVED',
          },
        });

        const distinctOfficerCount = new Set(currentApprovals.map((a) => a.officerId)).size;

        // Require 2 distinct officer approvals to advance
        if (distinctOfficerCount >= 2) {
          // If batch size >= 50, route to Quality Team Neha; otherwise skip directly to State Office Farah
          const nextReviewLevel = batch.totalCandidates >= 50 ? ReviewLevel.QUALITY : ReviewLevel.STATE;

          const updatedBatch = await tx.batch.update({
            where: { id: batch.id },
            data: {
              status: BatchStatus.DISTRICT_APPROVED,
              currentReviewLevel: nextReviewLevel,
            },
          });

          return {
            batch: updatedBatch,
            advanced: true,
            approvalCount: distinctOfficerCount,
            nextReviewLevel,
            priorState: batch.status,
          };
        } else {
          // Exactly 1 approval recorded so far
          return {
            batch,
            advanced: false,
            approvalCount: distinctOfficerCount,
            nextReviewLevel: ReviewLevel.DISTRICT,
            priorState: batch.status,
          };
        }
      }

      // ==========================================
      // STAGE 2: QUALITY TEAM APPROVAL (>= 50 candidates)
      // ==========================================
      if (user.role === Role.QUALITY_TEAM) {
        if (batch.status !== BatchStatus.DISTRICT_APPROVED) {
          throw new AppError(`Quality team can only review batches in DISTRICT_APPROVED state. Current: ${batch.status}`, 400);
        }

        if (batch.totalCandidates < 50) {
          throw new AppError('Quality Team review is only applicable for large batches (>= 50 candidates).', 400);
        }

        await tx.batchApproval.create({
          data: {
            batchId: batch.id,
            officerId: user.id,
            officerName: user.name,
            role: user.role,
            level: 'QUALITY',
            version: batch.version,
            status: 'APPROVED',
            comments: comments || 'Quality verification passed',
          },
        });

        const updatedBatch = await tx.batch.update({
          where: { id: batch.id },
          data: {
            status: BatchStatus.QUALITY_APPROVED,
            currentReviewLevel: ReviewLevel.STATE,
          },
        });

        return {
          batch: updatedBatch,
          advanced: true,
          approvalCount: 1,
          nextReviewLevel: ReviewLevel.STATE,
          priorState: batch.status,
        };
      }

      // ==========================================
      // STAGE 3: STATE OFFICE APPROVAL (Farah - Final Approval)
      // ==========================================
      if (user.role === Role.STATE_OFFICE) {
        const canApprove =
          (batch.totalCandidates >= 50 && batch.status === BatchStatus.QUALITY_APPROVED) ||
          (batch.totalCandidates < 50 && batch.status === BatchStatus.DISTRICT_APPROVED) ||
          batch.status === BatchStatus.ESCALATED;

        if (!canApprove) {
          throw new AppError(
            `State office cannot approve batch in ${batch.status} state. Required: QUALITY_APPROVED (for >=50) or DISTRICT_APPROVED (for <50).`,
            400
          );
        }

        await tx.batchApproval.create({
          data: {
            batchId: batch.id,
            officerId: user.id,
            officerName: user.name,
            role: user.role,
            level: 'STATE',
            version: batch.version,
            status: 'APPROVED',
            comments: comments || 'State Office final sanction granted',
          },
        });

        const updatedBatch = await tx.batch.update({
          where: { id: batch.id },
          data: {
            status: BatchStatus.STATE_APPROVED,
            currentReviewLevel: ReviewLevel.COMPLETED,
          },
        });

        return {
          batch: updatedBatch,
          advanced: true,
          approvalCount: 1,
          nextReviewLevel: ReviewLevel.COMPLETED,
          priorState: batch.status,
          finalApproval: true,
        };
      }

      throw new AppError(`User role ${user.role} is not authorized to approve batches.`, 403);
    });

    // Post-transaction handling: SLAs, Audit Logs, and BullMQ Events
    const { batch, advanced, approvalCount, nextReviewLevel, finalApproval, priorState } = transitionResult;

    // Log the approval in audit trail
    await AuditService.log({
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: advanced ? 'BATCH_APPROVAL_ADVANCED' : 'BATCH_OFFICER_APPROVED',
      targetType: 'BATCH',
      targetId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        version: batch.version,
        approvalCount,
        advanced,
        newStatus: batch.status,
        nextReviewLevel,
        comments,
      },
    });

    // Handle SLA schedule/cancellation
    if (advanced) {
      // Cancel prior SLA
      await SlaService.cancelSla(batch.id, batch.version, priorState as BatchStatus);

      if (finalApproval) {
        // Enqueue batch.approved job to BullMQ Issuance Queue
        await issuanceQueue.add('process-batch-issuance', {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          approvedAt: new Date().toISOString(),
        });

        sseHub.broadcast('BATCH_ISSUANCE_STARTED', {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          totalCandidates: batch.totalCandidates,
        });
      } else {
        // Schedule next SLA stage for Quality or State Office
        await SlaService.scheduleSla(batch.id, batch.version, batch.status);
      }
    }

    // Broadcast SSE update to frontend
    sseHub.broadcast('BATCH_APPROVAL_RECORDED', {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      currentReviewLevel: batch.currentReviewLevel,
      approvalCount,
      approvedBy: user.name,
      role: user.role,
    });

    return transitionResult;
  }

  /**
   * Reject / Send Back with mandatory reason (Any reviewer)
   */
  public static async requestChanges(
    batchId: string,
    user: AuthenticatedUser,
    reason: string
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new AppError('A clear, mandatory reason is required to request changes (min 5 characters).', 400);
    }

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: { centre: true },
    });

    if (!batch) {
      throw new AppError('Batch not found.', 404);
    }

    if (user.role === Role.DISTRICT_OFFICER && user.district && batch.centre?.district !== user.district) {
      throw new AppError(`Forbidden: District officer from ${user.district} cannot review batch from ${batch.centre?.district || 'other district'}.`, 403);
    }

    if (user.role === Role.QUALITY_TEAM) {
      if (batch.status !== BatchStatus.DISTRICT_APPROVED) {
        throw new AppError(`Forbidden: Quality Team can only review batches in DISTRICT_APPROVED status. Current: ${batch.status}`, 403);
      }
      if (batch.totalCandidates < 50) {
        throw new AppError('Forbidden: Quality Team review is only applicable for large batches (>= 50 candidates).', 403);
      }
    }

    if (
      batch.status === BatchStatus.STATE_APPROVED ||
      batch.status === BatchStatus.DRAFT
    ) {
      throw new AppError(`Cannot request changes for batch in ${batch.status} state.`, 400);
    }

    // Update batch to CHANGES_REQUESTED
    const updated = await prisma.batch.update({
      where: { id: batchId },
      data: {
        status: BatchStatus.CHANGES_REQUESTED,
        currentReviewLevel: ReviewLevel.REJECTED,
        rejectionReason: reason.trim(),
        rejectedBy: `${user.name} (${user.role})`,
      },
    });

    // Cancel pending SLA
    await SlaService.cancelSla(batch.id, batch.version, batch.status);

    // Audit log
    await AuditService.log({
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: 'BATCH_CHANGES_REQUESTED',
      targetType: 'BATCH',
      targetId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        reason: reason.trim(),
        previousStatus: batch.status,
      },
    });

    sseHub.broadcast('BATCH_CHANGES_REQUESTED', {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      reason: reason.trim(),
      rejectedBy: user.name,
      role: user.role,
    });

    return updated;
  }

  /**
   * Centre edits & resubmits batch.
   * Explicit Policy: Invalidates all prior approvals (REVOKED_ON_RESUBMIT in audit log)
   * so officers never sign off on unreviewed data.
   */
  public static async resubmitBatch(
    batchId: string,
    user: AuthenticatedUser,
    updatedCandidates?: ValidatedCandidate[]
  ) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new AppError('Batch not found.', 404);
    }

    if (user.role === Role.TRAINING_CENTRE && user.centreId && batch.centreId !== user.centreId) {
      throw new AppError('Forbidden: Training Centre can only resubmit batches belonging to their centre.', 403);
    }

    if (batch.status !== BatchStatus.CHANGES_REQUESTED) {
      throw new AppError(`Only batches in CHANGES_REQUESTED status can be resubmitted. Current: ${batch.status}`, 400);
    }

    const newVersion = batch.version + 1;

    // Run atomic resubmission transaction
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Invalidate all prior approvals for this batch
      await tx.batchApproval.updateMany({
        where: {
          batchId: batch.id,
          status: 'APPROVED',
        },
        data: {
          status: 'REVOKED_ON_RESUBMIT',
        },
      });

      // 2. Optionally replace candidate records if new data was provided
      if (updatedCandidates && updatedCandidates.length > 0) {
        await tx.candidate.deleteMany({
          where: { batchId: batch.id },
        });

        await tx.candidate.createMany({
          data: updatedCandidates.map((c) => ({
            batchId: batch.id,
            name: c.name,
            fatherName: c.fatherName,
            dateOfBirth: c.dateOfBirth,
            gender: c.gender,
            aadharLast4: c.aadharLast4,
            phone: c.phone,
            course: c.course || batch.courseName,
            grade: c.grade,
            completionDate: c.completionDate,
          })),
        });
      }

      // 3. Reset state to SUBMITTED and increment version
      return tx.batch.update({
        where: { id: batch.id },
        data: {
          status: BatchStatus.SUBMITTED,
          currentReviewLevel: ReviewLevel.DISTRICT,
          version: newVersion,
          totalCandidates: updatedCandidates ? updatedCandidates.length : batch.totalCandidates,
          rejectionReason: null,
          rejectedBy: null,
        },
      });
    });

    // Schedule fresh SLA for the new version
    await SlaService.scheduleSla(batch.id, newVersion, BatchStatus.SUBMITTED);

    // Audit log documenting invalidation of prior approvals
    await AuditService.log({
      actorId: user.id,
      actorName: user.name,
      role: user.role,
      action: 'BATCH_RESUBMITTED_APPROVALS_INVALIDATED',
      targetType: 'BATCH',
      targetId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        newVersion,
        policy: 'REVOKED_ON_RESUBMIT',
        message: 'All prior officer/quality approvals have been invalidated. Full review cycle restarted.',
      },
    });

    sseHub.broadcast('BATCH_RESUBMITTED', {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      version: newVersion,
      status: BatchStatus.SUBMITTED,
    });

    return updated;
  }
}
