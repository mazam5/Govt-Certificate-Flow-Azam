import { Request, Response, NextFunction } from 'express';
import { CertificateService } from '../services/certificate.service.js';
import { AppError } from '../middleware/errorHandler.js';

export class VerifyController {
  public static async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const paramCert = req.params.certNumber;
      const certNumber = Array.isArray(paramCert) ? paramCert[0] : paramCert;

      if (!certNumber || !certNumber.trim()) {
        throw new AppError('Certificate number is required for verification.', 400);
      }

      const cleanCertNumber = certNumber.trim().toUpperCase();
      const verification = await CertificateService.getPublicVerification(cleanCertNumber);

      if (!verification) {
        res.status(404).json({
          success: false,
          valid: false,
          error: 'Certificate not found. This credential may be invalid or not yet issued.',
        });
        return;
      }

      res.json({
        success: true,
        valid: verification.status === 'VALID',
        data: verification,
      });
    } catch (err) {
      next(err);
    }
  }
}
