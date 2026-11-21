import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { BatchService } from '../services/batch.service.js';
import { SpreadsheetService } from '../services/spreadsheet.service.js';
import { AuditService } from '../services/audit.service.js';
import { prisma } from '../config/prisma.js';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

function getSingleParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export class BatchController {
  public static async uploadBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No spreadsheet file uploaded. Please upload a .csv or .xlsx file.', 400);
      }

      const courseName = (req.body.courseName || req.body.course || 'Vocational Skill Certification').trim();
      const rawRows = SpreadsheetService.parseFile(req.file.buffer);

      const validation = SpreadsheetService.validateRows(rawRows);

      if (!validation.isValid) {
        res.status(422).json({
          success: false,
          error: 'Spreadsheet validation failed. All errors must be resolved before upload.',
          errorCount: validation.errors.length,
          errors: validation.errors,
        });
        return;
      }

      const user = req.user!;
      const batch = await BatchService.createBatchWithCandidates(user, {
        courseName,
        candidates: validation.candidates,
      });

      res.status(201).json({
        success: true,
        message: `Successfully created batch ${batch.batchNumber} with ${validation.candidates.length} candidates.`,
        data: batch,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getBatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      let whereClause: any = {};

      if (user) {
        if (user.role === Role.TRAINING_CENTRE && user.centreId) {
          whereClause.centreId = user.centreId;
        } else if (user.role === Role.DISTRICT_OFFICER && user.district) {
          whereClause.centre = { district: user.district };
        }
      }

      const batches = await prisma.batch.findMany({
        where: whereClause,
        include: {
          centre: true,
          approvals: {
            where: { status: 'APPROVED' },
          },
          _count: {
            select: { candidates: true, certificates: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: batches,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getBatchById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getSingleParam(req.params.id);
      const batch = await prisma.batch.findUnique({
        where: { id },
        include: {
          centre: true,
          candidates: {
            include: {
              certificate: true,
              delivery: true,
            },
          },
          approvals: {
            orderBy: { approvedAt: 'asc' },
          },
          certificates: true,
        },
      });

      if (!batch) {
        throw new AppError('Batch not found', 404);
      }

      const auditLogs = await AuditService.getLogsForTarget(batch.id);

      res.json({
        success: true,
        data: {
          ...batch,
          auditLogs,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async submitBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getSingleParam(req.params.id);
      const user = req.user!;
      const result = await BatchService.submitBatch(id, user);

      res.json({
        success: true,
        message: `Batch ${result.batchNumber} submitted for district review.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async approveBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getSingleParam(req.params.id);
      const user = req.user!;
      const { comments } = req.body;

      const result = await BatchService.approveBatch(id, user, comments);

      res.json({
        success: true,
        message: result.advanced
          ? `Batch approval advanced to next stage (${result.nextReviewLevel})`
          : `Officer approval recorded (${result.approvalCount}/2 approvals)`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async requestChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getSingleParam(req.params.id);
      const user = req.user!;
      const { reason } = req.body;

      const result = await BatchService.requestChanges(id, user, reason);

      res.json({
        success: true,
        message: `Changes requested for batch ${result.batchNumber}. Sent back to Training Centre.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async resubmitBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getSingleParam(req.params.id);
      const user = req.user!;

      let updatedCandidates;
      if (req.file) {
        const raw = SpreadsheetService.parseFile(req.file.buffer);
        const val = SpreadsheetService.validateRows(raw);
        if (!val.isValid) {
          res.status(422).json({
            success: false,
            error: 'Spreadsheet validation failed on resubmission.',
            errors: val.errors,
          });
          return;
        }
        updatedCandidates = val.candidates;
      }

      const result = await BatchService.resubmitBatch(id, user, updatedCandidates);

      res.json({
        success: true,
        message: `Batch ${result.batchNumber} resubmitted (version ${result.version}). Prior approvals invalidated.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static downloadSampleCsv(req: Request, res: Response): void {
    const count = parseInt((req.query.count as string) || '5', 10);
    const csvContent = SpreadsheetService.generateSampleCsv(count);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pragati_sample_candidates.csv"');
    res.send(csvContent);
  }
}
