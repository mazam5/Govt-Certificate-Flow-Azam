import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { CertificateService } from '../services/certificate.service.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

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

      const cert = await prisma.certificate.findUnique({
        where: { certNumber },
      });

      if (!cert || !cert.pdfPath) {
        throw new AppError(`Certificate PDF not found for ${certNumber}`, 404);
      }

      if (!fs.existsSync(cert.pdfPath)) {
        throw new AppError('Certificate PDF file is missing on storage server.', 404);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${cert.certNumber}.pdf"`);
      fs.createReadStream(cert.pdfPath).pipe(res);
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
