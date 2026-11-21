import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { CertificateService } from '../services/certificate.service.js';
import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { CertificateStatus } from '@prisma/client';

export class CertificateController {
  public static async getCertificates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { search, batchId } = req.query;

      const whereClause: any = {};
      if (batchId) {
        whereClause.batchId = String(batchId);
      }
      if (search) {
        whereClause.OR = [
          { certNumber: { contains: String(search), mode: 'insensitive' } },
          { candidateName: { contains: String(search), mode: 'insensitive' } },
        ];
      }

      const certs = await prisma.certificate.findMany({
        where: whereClause,
        include: {
          batch: true,
          deliveryLogs: true,
        },
        orderBy: { issueDate: 'desc' },
      });

      res.json({
        success: true,
        data: certs,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async downloadPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const paramCert = req.params.certNumber;
      const certNumber = Array.isArray(paramCert) ? paramCert[0] : paramCert;

      if (!certNumber) {
        throw new AppError('Certificate number is required', 400);
      }

      const cert = await prisma.certificate.findUnique({
        where: { certNumber },
      });

      if (!cert) {
        throw new AppError(`Certificate not found: ${certNumber}`, 404);
      }

      if (cert.status === CertificateStatus.REVOKED) {
        throw new AppError(`Certificate ${certNumber} has been revoked and cannot be downloaded.`, 409);
      }

      // Check if file exists either at recorded pdfPath or standard storage dir
      const defaultPath = path.join(config.certificateStoragePath, `${cert.certNumber}.pdf`);
      const targetPath = cert.pdfPath && fs.existsSync(cert.pdfPath) ? cert.pdfPath : defaultPath;

      if (!fs.existsSync(targetPath)) {
        throw new AppError(`Certificate PDF has not yet been generated for ${certNumber}.`, 404);
      }

      const stat = fs.statSync(targetPath);
      if (stat.size === 0) {
        throw new AppError(`Certificate PDF file is corrupted or empty for ${certNumber}.`, 500);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${cert.certNumber}.pdf"`);
      res.setHeader('Content-Length', stat.size);

      const stream = fs.createReadStream(targetPath);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  public static async revokeCertificate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const paramCert = req.params.certNumber;
      const certNumber = (Array.isArray(paramCert) ? paramCert[0] : paramCert) || '';
      const { reason } = req.body;
      const user = req.user!;

      if (!reason || reason.trim().length < 5) {
        throw new AppError('Revocation reason is required (min 5 characters).', 400);
      }

      const revoked = await CertificateService.revokeCertificate({
        certNumber,
        revokedByUserId: user.id,
        revokedByUserName: user.name,
        reason: reason.trim(),
      });

      res.json({
        success: true,
        message: `Certificate ${certNumber} has been revoked. Public cache invalidated immediately.`,
        data: revoked,
      });
    } catch (err) {
      next(err);
    }
  }
}
