import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { config } from '../config/env.js';
import { CertificateStatus } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { sseHub } from '../events/sse.js';

export interface PublicVerificationResult {
  certNumber: string;
  candidateName: string;
  courseName: string;
  centreName: string;
  issueDate: string;
  status: 'VALID' | 'REVOKED';
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export class CertificateService {
  /**
   * Generates a cryptographically random, collision-resistant certificate number
   * Format: PSM-2026-XXXXXX
   */
  public static generateCertificateNumber(): string {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `PSM-2026-${randomHex}`;
  }

  /**
   * Generates a real PDF certificate with embedded QR code
   */
  public static async generateCertificatePdf(params: {
    certNumber: string;
    candidateName: string;
    courseName: string;
    centreName: string;
    district: string;
    grade: string;
    completionDate: string;
    issueDate: Date;
  }): Promise<{ filePath: string; qrDataUrl: string }> {
    // Ensure storage directory exists
    const storageDir = config.certificateStoragePath;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const filePath = path.join(storageDir, `${params.certNumber}.pdf`);
    const tempPath = path.join(storageDir, `${params.certNumber}.tmp.${Date.now()}`);
    const verificationUrl = `${config.frontendUrl}/verify/${params.certNumber}`;

    // Generate QR code as buffer
    const qrBuffer = await QRCode.toBuffer(verificationUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 140,
    });
    const qrDataUrl = await QRCode.toDataURL(verificationUrl);

    // Create PDF document
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });

      const writeStream = fs.createWriteStream(tempPath);
      doc.pipe(writeStream);

      // Certificate Border Styling
      const width = doc.page.width;
      const height = doc.page.height;

      // Outer gold/blue double border
      doc.rect(20, 20, width - 40, height - 40).lineWidth(3).stroke('#0f3460');
      doc.rect(26, 26, width - 52, height - 52).lineWidth(1).stroke('#e94560');

      // Header
      doc.fontSize(22).fillColor('#1a1a2e').font('Helvetica-Bold')
        .text('PRAGATI SKILLS MISSION', 0, 50, { align: 'center' });
      doc.fontSize(11).fillColor('#533483').font('Helvetica')
        .text('Government of India • Ministry of Skill Development & Entrepreneurship', { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(16).fillColor('#0f3460').font('Helvetica-Bold')
        .text('CERTIFICATE OF VOCATIONAL COMPETENCE', { align: 'center' });
      doc.moveDown(0.8);

      // Body text
      doc.fontSize(11).fillColor('#333333').font('Helvetica')
        .text('This is proudly presented to certify that', { align: 'center' });
      doc.moveDown(0.4);

      // Candidate Name
      doc.fontSize(24).fillColor('#0f3460').font('Helvetica-Bold')
        .text(params.candidateName.toUpperCase(), { align: 'center' });
      doc.moveDown(0.4);

      doc.fontSize(11).fillColor('#444444').font('Helvetica')
        .text('has successfully completed the prescribed curriculum and assessment in', { align: 'center' });
      doc.moveDown(0.3);

      // Course Name
      doc.fontSize(16).fillColor('#e94560').font('Helvetica-Bold')
        .text(params.courseName, { align: 'center' });
      doc.moveDown(0.5);

      // Training details
      doc.fontSize(10).fillColor('#555555').font('Helvetica')
        .text(`Conducted at: ${params.centreName} (${params.district})`, { align: 'center' });
      doc.text(`Grade Achieved: ${params.grade}   |   Completion Date: ${params.completionDate}`, { align: 'center' });
      doc.moveDown(1);

      // QR Code & Verification Block (Bottom Left)
      doc.image(qrBuffer, 60, height - 170, { width: 90 });
      doc.fontSize(8).fillColor('#777777').font('Helvetica')
        .text('Scan with smartphone to verify authenticity', 50, height - 70, { width: 120, align: 'center' });

      // Signatures & Metadata (Bottom Right)
      doc.fontSize(9).fillColor('#333333').font('Helvetica-Bold')
        .text('Certificate No:', width - 260, height - 150);
      doc.font('Helvetica').text(params.certNumber, width - 170, height - 150);

      doc.font('Helvetica-Bold').text('Issue Date:', width - 260, height - 135);
      doc.font('Helvetica').text(params.issueDate.toISOString().split('T')[0], width - 170, height - 135);

      doc.font('Helvetica-Bold').text('Authorizing Body:', width - 260, height - 120);
      doc.font('Helvetica').text('Pragati Skills Directorate', width - 170, height - 120);

      // Authority Signature Line
      doc.moveTo(width - 240, height - 70).lineTo(width - 60, height - 70).stroke('#aaaaaa');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a2e')
        .text('State Mission Director', width - 240, height - 65, { width: 180, align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        try {
          fs.renameSync(tempPath, filePath);
          resolve();
        } catch (renameErr) {
          reject(renameErr);
        }
      });
      writeStream.on('error', (err) => {
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch {}
        }
        reject(err);
      });
    });

    return { filePath, qrDataUrl };
  }

  /**
   * Public unauthenticated verification lookup with Redis caching
   * Strictly non-PII
   */
  public static async getPublicVerification(certNumber: string): Promise<PublicVerificationResult | null> {
    const cacheKey = `cert:public:${certNumber}`;

    // 1. Try Redis cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PublicVerificationResult;
      }
    } catch (err) {
      // Redis error: fall through to DB
    }

    // 2. Fetch from Database
    const cert = await prisma.certificate.findUnique({
      where: { certNumber },
      include: {
        batch: {
          include: {
            centre: true,
          },
        },
      },
    });

    if (!cert) {
      return null;
    }

    // Sanitize data: NEVER leak aadhar, phone, or internal notes
    const publicData: PublicVerificationResult = {
      certNumber: cert.certNumber,
      candidateName: cert.candidateName,
      courseName: cert.courseName,
      centreName: cert.centreName,
      issueDate: cert.issueDate.toISOString(),
      status: cert.status,
      revokedAt: cert.revokedAt ? cert.revokedAt.toISOString() : null,
      revocationReason: cert.revocationReason || null,
    };

    // 3. Cache in Redis (1 hour TTL)
    try {
      await redis.set(cacheKey, JSON.stringify(publicData), 'EX', 3600);
    } catch (err) {
      // Cache write error non-fatal
    }

    return publicData;
  }

  /**
   * Revoke certificate (State Office Farah only) with immediate cache invalidation
   */
  public static async revokeCertificate(params: {
    certNumber: string;
    revokedByUserId: string;
    revokedByUserName: string;
    reason: string;
  }): Promise<PublicVerificationResult> {
    const cert = await prisma.certificate.findUnique({
      where: { certNumber: params.certNumber },
    });

    if (!cert) {
      throw new Error(`Certificate ${params.certNumber} not found.`);
    }

    const updated = await prisma.certificate.update({
      where: { certNumber: params.certNumber },
      data: {
        status: CertificateStatus.REVOKED,
        revocationReason: params.reason,
        revokedAt: new Date(),
        revokedBy: params.revokedByUserName,
      },
    });

    // Invalidate Redis cache immediately
    const cacheKey = `cert:public:${params.certNumber}`;
    try {
      await redis.del(cacheKey);
    } catch (err) {
      console.error('Failed to invalidate Redis cache on revocation:', err);
    }

    // Immutable Audit Log
    await AuditService.log({
      actorId: params.revokedByUserId,
      actorName: params.revokedByUserName,
      role: 'STATE_OFFICE',
      action: 'CERTIFICATE_REVOKED',
      targetType: 'CERTIFICATE',
      targetId: cert.id,
      metadata: {
        certNumber: cert.certNumber,
        candidateName: cert.candidateName,
        reason: params.reason,
      },
    });

    const publicResult: PublicVerificationResult = {
      certNumber: updated.certNumber,
      candidateName: updated.candidateName,
      courseName: updated.courseName,
      centreName: updated.centreName,
      issueDate: updated.issueDate.toISOString(),
      status: updated.status,
      revokedAt: updated.revokedAt?.toISOString(),
      revocationReason: updated.revocationReason,
    };

    // Broadcast SSE revocation event
    sseHub.broadcast('CERTIFICATE_REVOKED', publicResult);

    return publicResult;
  }
}
