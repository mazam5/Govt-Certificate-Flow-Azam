import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { app } from '../app.js';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { CertificateService } from '../services/certificate.service.js';
import { BatchStatus, CertificateStatus } from '@prisma/client';

describe('PDF Certificate Generation & Download Pipeline', () => {
  let testCentreId: string;
  let testBatchId: string;
  let testCandidateId: string;
  const testCertNumber = `PSM-2026-TEST${Math.floor(100000 + Math.random() * 900000)}`;

  beforeAll(async () => {
    // Ensure test training centre exists
    const centre = await prisma.trainingCentre.upsert({
      where: { code: 'TC-DISTA-001' },
      update: {},
      create: {
        id: 'tc-dista-001',
        name: 'Pragati Training Centre - District A',
        code: 'TC-DISTA-001',
        district: 'District A',
      },
    });
    testCentreId = centre.id;

    // Create a test batch and candidate
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `BATCH-PDF-TEST-${Date.now()}`,
        centreId: testCentreId,
        courseName: 'Solar PV Tech',
        totalCandidates: 1,
        status: BatchStatus.STATE_APPROVED,
      },
    });
    testBatchId = batch.id;

    const candidate = await prisma.candidate.create({
      data: {
        batchId: testBatchId,
        name: 'Kavita Verma',
        fatherName: 'Suresh Verma',
        dateOfBirth: '2001-09-18',
        gender: 'Female',
        aadharLast4: '7721',
        phone: '9876543210',
        course: 'Solar PV Tech',
        grade: 'A+',
        completionDate: '2026-02-15',
      },
    });
    testCandidateId = candidate.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  it('1. Generates an authentic PDFKit certificate with embedded QR code and valid %PDF- magic bytes', async () => {
    const { filePath, qrDataUrl } = await CertificateService.generateCertificatePdf({
      certNumber: testCertNumber,
      candidateName: 'Kavita Verma',
      courseName: 'Solar PV Tech',
      centreName: 'Pragati Training Centre - District A',
      district: 'District A',
      grade: 'A+',
      completionDate: '2026-02-15',
      issueDate: new Date(),
    });

    // Verify file exists on disk
    expect(fs.existsSync(filePath)).toBe(true);

    // Verify file size is substantial (not zero or empty)
    const fileStat = fs.statSync(filePath);
    expect(fileStat.size).toBeGreaterThan(1500);

    // Verify magic bytes: PDF specifications mandate the file begins with %PDF-
    const fd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(5);
    fs.readSync(fd, headerBuffer, 0, 5, 0);
    fs.closeSync(fd);
    expect(headerBuffer.toString('utf-8')).toBe('%PDF-');

    // Verify QR code Data URL is generated
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // Insert Certificate in DB pointing to the generated file
    await prisma.certificate.create({
      data: {
        certNumber: testCertNumber,
        batchId: testBatchId,
        candidateId: testCandidateId,
        candidateName: 'Kavita Verma',
        courseName: 'Solar PV Tech',
        centreName: 'Pragati Training Centre - District A',
        district: 'District A',
        issueDate: new Date(),
        pdfPath: filePath,
        qrCodeData: qrDataUrl,
        status: CertificateStatus.VALID,
      },
    });
  });

  it('2. GET /api/certificates/:certNumber/download streams the PDF file with proper headers', async () => {
    const response = await request(app)
      .get(`/api/certificates/${testCertNumber}/download`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${testCertNumber}.pdf"`
    );
    expect(response.body).toBeInstanceOf(Buffer);
    expect(response.body.length).toBeGreaterThan(1500);
    expect(response.body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  it('3. GET /api/certificates/:certNumber/pdf alias also streams the PDF successfully', async () => {
    const response = await request(app)
      .get(`/api/certificates/${testCertNumber}/pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  it('4. GET /api/certificates/:certNumber/download returns HTTP 409 Conflict if revoked', async () => {
    // Revoke the certificate
    await prisma.certificate.update({
      where: { certNumber: testCertNumber },
      data: {
        status: CertificateStatus.REVOKED,
        revocationReason: 'Testing revocation constraint on PDF download',
        revokedAt: new Date(),
      },
    });

    const response = await request(app).get(`/api/certificates/${testCertNumber}/download`);
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('revoked');
  });

  it('5. GET /api/certificates/:certNumber/download returns HTTP 404 Not Found for nonexistent certificate', async () => {
    const response = await request(app).get('/api/certificates/PSM-2026-NONEXISTENT/download');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('not found');
  });

  it('6. GET /api/verify/:certNumber/download unauthenticated public route alias streams PDF for valid cert', async () => {
    // Reset to VALID to test public verify alias
    await prisma.certificate.update({
      where: { certNumber: testCertNumber },
      data: {
        status: CertificateStatus.VALID,
        revocationReason: null,
        revokedAt: null,
      },
    });

    const response = await request(app)
      .get(`/api/verify/${testCertNumber}/download`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });
});
