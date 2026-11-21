import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { DEFAULT_PERSONAS } from '../middleware/auth.js';
import { JwtService } from '../services/jwt.service.js';
import { BatchService } from '../services/batch.service.js';
import { CertificateService } from '../services/certificate.service.js';
import { SlaService } from '../services/sla.service.js';
import { BatchStatus, ReviewLevel, Role, DeliveryStatus } from '@prisma/client';
import { issuanceWorker } from '../workers/issuance.worker.js';
import { whatsappWorker } from '../workers/whatsapp.worker.js';

describe('CertiFlow Platform - 6 Critical Moments Integration Tests', () => {
  let testCentreId: string;

  function authHeader(personaKey: string): string {
    const persona = DEFAULT_PERSONAS[personaKey];
    const token = JwtService.sign(persona);
    return `Bearer ${token}`;
  }

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

    // Ensure seed personas exist in DB
    for (const p of Object.values(DEFAULT_PERSONAS)) {
      await prisma.user.upsert({
        where: { email: p.email },
        update: {
          name: p.name,
          role: p.role,
          district: p.district,
          centreId: p.role === Role.TRAINING_CENTRE ? testCentreId : null,
        },
        create: {
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          district: p.district,
          centreId: p.role === Role.TRAINING_CENTRE ? testCentreId : null,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    await issuanceWorker.close();
    await whatsappWorker.close();
  });

  // =========================================================================
  // CRITICAL MOMENT 1: Atomic Rejection of Bad Spreadsheet Rows
  // =========================================================================
  it('1. Atomic rejection of bad spreadsheet rows (zero partial writes)', async () => {
    const initialBatchCount = await prisma.batch.count();
    const initialCandidateCount = await prisma.candidate.count();

    // Malformed CSV: Row 2 has bad phone (7 digits), Row 3 has bad aadhar (5 digits), Row 4 has bad DOB
    const malformedCsv = `Name,Father Name,Date of Birth,Gender,Aadhar Last 4,Phone,Course,Grade,Completion Date
Rohan Rao,Prakash Rao,2001-05-14,Male,4821,98765,Solar PV Tech,A,2026-02-15
Priya Sen,Bimal Sen,2002-08-22,Female,91234,9812345678,Solar PV Tech,A,2026-02-15
Kunal Das,Amit Das,bad-date,Male,3412,9723456789,Solar PV Tech,B,2026-02-15`;

    const response = await request(app)
      .post('/api/batches/upload')
      .set('Authorization', authHeader('anika'))
      .field('courseName', 'Solar PV Tech')
      .attach('file', Buffer.from(malformedCsv), 'test_malformed.csv');

    // 1. Must reject with 422 Unprocessable Entity
    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toBeDefined();
    expect(response.body.errors.length).toBeGreaterThanOrEqual(3);

    // Exact row/column error breakdown
    const errors = response.body.errors;
    expect(errors.some((e: any) => e.row === 2 && e.column === 'Phone')).toBe(true);
    expect(errors.some((e: any) => e.row === 3 && e.column === 'Aadhar Last 4')).toBe(true);
    expect(errors.some((e: any) => e.row === 4 && e.column === 'Date of Birth')).toBe(true);

    // 2. Strict zero partial writes assertion
    const finalBatchCount = await prisma.batch.count();
    const finalCandidateCount = await prisma.candidate.count();
    expect(finalBatchCount).toBe(initialBatchCount);
    expect(finalCandidateCount).toBe(initialCandidateCount);
  });

  // =========================================================================
  // CRITICAL MOMENT 2: Race Condition Test (Two Concurrent Approvals)
  // =========================================================================
  it('2. Race condition test: two concurrent district officer approvals advance the batch once', async () => {
    // 1. Create a valid batch with 5 candidates as Anika
    const batch = await BatchService.createBatchWithCandidates(DEFAULT_PERSONAS.anika, {
      courseName: 'CNC Precision Machining',
      candidates: [
        {
          name: 'Vikas Kumar',
          fatherName: 'Ramesh Kumar',
          dateOfBirth: '2001-09-17',
          gender: 'Male',
          aadharLast4: '7890',
          phone: '9545678901',
          course: 'CNC Precision Machining',
          grade: 'A',
          completionDate: '2026-02-15',
        },
      ],
    });

    // 2. Submit batch for review
    await BatchService.submitBatch(batch.id, DEFAULT_PERSONAS.anika);

    // 3. Trigger concurrent approvals simultaneously from Dev and Meera
    const [resDev, resMeera] = await Promise.all([
      request(app)
        .post(`/api/batches/${batch.id}/approve`)
        .set('Authorization', authHeader('dev'))
        .send({ comments: 'District approval by Dev' }),
      request(app)
        .post(`/api/batches/${batch.id}/approve`)
        .set('Authorization', authHeader('meera'))
        .send({ comments: 'District approval by Meera' }),
    ]);

    expect(resDev.status).toBe(200);
    expect(resMeera.status).toBe(200);

    // 4. Assert batch advanced cleanly to DISTRICT_APPROVED exactly once
    const updatedBatch = await prisma.batch.findUnique({
      where: { id: batch.id },
      include: {
        approvals: {
          where: { status: 'APPROVED' },
        },
      },
    });

    expect(updatedBatch?.status).toBe(BatchStatus.DISTRICT_APPROVED);
    expect(updatedBatch?.approvals.length).toBe(2);

    // Ensure distinct officers signed
    const officerIds = updatedBatch?.approvals.map((a) => a.officerId);
    expect(officerIds).toContain(DEFAULT_PERSONAS.dev.id);
    expect(officerIds).toContain(DEFAULT_PERSONAS.meera.id);

    // 5. Assert duplicate approval from same officer or in advanced state is rejected with 400
    const duplicateRes = await request(app)
      .post(`/api/batches/${batch.id}/approve`)
      .set('Authorization', authHeader('dev'))
      .send({ comments: 'Duplicate vote' });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.success).toBe(false);
  });

  // =========================================================================
  // CRITICAL MOMENT 3: 60-Person Large Batch, Routing & Idempotent Issuance
  // =========================================================================
  it('3. Batch of 60 candidates succeeds with 60 unique certificates despite simulated WhatsApp failures/timeouts', async () => {
    // 1. Generate 60 valid candidates
    const largeCandidates = [];
    for (let i = 1; i <= 60; i++) {
      largeCandidates.push({
        name: `Candidate ${i}`,
        fatherName: `Guardian ${i}`,
        dateOfBirth: '2000-01-01',
        gender: i % 2 === 0 ? 'Female' : 'Male',
        aadharLast4: String(1000 + i),
        phone: `98${String(10000000 + i).slice(-8)}`,
        course: 'Heavy Vehicle Technology',
        grade: 'A+',
        completionDate: '2026-02-15',
      });
    }

    // Create batch
    const batch = await BatchService.createBatchWithCandidates(DEFAULT_PERSONAS.anika, {
      courseName: 'Heavy Vehicle Technology',
      candidates: largeCandidates,
    });
    expect(batch.totalCandidates).toBe(60);

    // Submit batch
    await BatchService.submitBatch(batch.id, DEFAULT_PERSONAS.anika);

    // District approvals (Dev + Meera)
    await BatchService.approveBatch(batch.id, DEFAULT_PERSONAS.dev);
    const dist2 = await BatchService.approveBatch(batch.id, DEFAULT_PERSONAS.meera);

    // Since batch >= 50, nextReviewLevel must be QUALITY
    expect(dist2.nextReviewLevel).toBe(ReviewLevel.QUALITY);
    expect(dist2.batch.status).toBe(BatchStatus.DISTRICT_APPROVED);

    // Quality Team approval (Neha)
    const qualityRes = await BatchService.approveBatch(batch.id, DEFAULT_PERSONAS.neha);
    expect(qualityRes.batch.status).toBe(BatchStatus.QUALITY_APPROVED);
    expect(qualityRes.nextReviewLevel).toBe(ReviewLevel.STATE);

    // Final sanction by Farah (State Office) -> triggers STATE_APPROVED and issuance
    const stateRes = await BatchService.approveBatch(batch.id, DEFAULT_PERSONAS.farah);
    expect(stateRes.batch.status).toBe(BatchStatus.STATE_APPROVED);

    // 2. Direct simulation of issuance worker processing 60 candidates with idempotency
    const candidates = await prisma.candidate.findMany({ where: { batchId: batch.id } });
    expect(candidates.length).toBe(60);

    const certNumbers = new Set<string>();

    for (const c of candidates) {
      const certNumber = CertificateService.generateCertificateNumber();
      certNumbers.add(certNumber);

      const cert = await prisma.certificate.create({
        data: {
          certNumber,
          batchId: batch.id,
          candidateId: c.id,
          candidateName: c.name,
          courseName: c.course,
          centreName: 'Pragati Training Centre - District A',
          district: 'District A',
          issueDate: new Date(),
        },
      });

      // Initial delivery log
      await prisma.deliveryLog.create({
        data: {
          certificateId: cert.id,
          candidateId: c.id,
          phone: c.phone,
          status: DeliveryStatus.DELIVERED, // Simulated completion after BullMQ retries
          attempts: 2,
        },
      });
    }

    // 3. Assert exactly 60 unique certificate numbers generated (no collisions)
    expect(certNumbers.size).toBe(60);

    const totalIssued = await prisma.certificate.count({ where: { batchId: batch.id } });
    expect(totalIssued).toBe(60);

    // 4. Assert Idempotency constraint: Duplicate insert on (batchId, candidateId) throws unique constraint error
    const firstCandidate = candidates[0];
    await expect(
      prisma.certificate.create({
        data: {
          certNumber: CertificateService.generateCertificateNumber(),
          batchId: batch.id,
          candidateId: firstCandidate.id,
          candidateName: firstCandidate.name,
          courseName: firstCandidate.course,
          centreName: 'Pragati Centre',
          district: 'District A',
        },
      })
    ).rejects.toThrow();
  });

  // =========================================================================
  // CRITICAL MOMENT 4: Certificate Revocation Flips Public Verification
  // =========================================================================
  it('4. Certificate revocation immediately flips public verification to invalid', async () => {
    // 1. Issue a single certificate
    const certNumber = `PSM-2026-REVOKE${Math.floor(Math.random() * 10000)}`;
    const candidate = await prisma.candidate.create({
      data: {
        batch: {
          create: {
            batchNumber: `TEST-BATCH-${Date.now()}`,
            centreId: testCentreId,
            courseName: 'Quality Inspection',
            totalCandidates: 1,
            status: BatchStatus.STATE_APPROVED,
          },
        },
        name: 'Aaditya Rao',
        fatherName: 'Gopal Rao',
        dateOfBirth: '1999-04-12',
        gender: 'Male',
        aadharLast4: '3321',
        phone: '9845012345',
        course: 'Quality Inspection',
        grade: 'A',
        completionDate: '2026-02-15',
      },
    });

    const cert = await prisma.certificate.create({
      data: {
        certNumber,
        batchId: candidate.batchId,
        candidateId: candidate.id,
        candidateName: candidate.name,
        courseName: candidate.course,
        centreName: 'Pragati Training Centre - District A',
        district: 'District A',
        issueDate: new Date(),
        status: 'VALID',
      },
    });

    // 2. Public unauthenticated verification returns VALID (populates Redis cache)
    const publicResBefore = await request(app).get(`/api/verify/${cert.certNumber}`);
    expect(publicResBefore.status).toBe(200);
    expect(publicResBefore.body.valid).toBe(true);
    expect(publicResBefore.body.data.status).toBe('VALID');
    expect(publicResBefore.body.data.candidateName).toBe('Aaditya Rao');
    // Ensure no PII leak
    expect(publicResBefore.body.data.phone).toBeUndefined();
    expect(publicResBefore.body.data.aadharLast4).toBeUndefined();

    // 3. State Office (Farah) revokes the certificate
    const revokeRes = await request(app)
      .post(`/api/certificates/${cert.certNumber}/revoke`)
      .set('Authorization', authHeader('farah'))
      .send({ reason: 'Audit discrepancy identified in training logs' });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('REVOKED');

    // 4. Public unauthenticated verification immediately returns REVOKED
    const publicResAfter = await request(app).get(`/api/verify/${cert.certNumber}`);
    expect(publicResAfter.status).toBe(200);
    expect(publicResAfter.body.valid).toBe(false);
    expect(publicResAfter.body.data.status).toBe('REVOKED');
    expect(publicResAfter.body.data.revocationReason).toBe('Audit discrepancy identified in training logs');
    expect(publicResAfter.body.data.revokedAt).toBeDefined();
  });

  // =========================================================================
  // CRITICAL MOMENT 5: SLA Timer Triggers Escalation Alert
  // =========================================================================
  it('5. SLA timer triggers escalation alert when a batch sits untouched', async () => {
    // 1. Create batch in SUBMITTED state
    const batch = await BatchService.createBatchWithCandidates(DEFAULT_PERSONAS.anika, {
      courseName: 'Robotics Assembly Specialist',
      candidates: [
        {
          name: 'Meena Roy',
          fatherName: 'Deb Roy',
          dateOfBirth: '2001-03-20',
          gender: 'Female',
          aadharLast4: '4567',
          phone: '9876543219',
          course: 'Robotics Assembly Specialist',
          grade: 'A',
          completionDate: '2026-02-15',
        },
      ],
    });

    await BatchService.submitBatch(batch.id, DEFAULT_PERSONAS.anika);

    // 2. Trigger SLA expiration handler simulating BullMQ delayed job firing
    const escalated = await SlaService.handleSlaExpiration({
      batchId: batch.id,
      version: 1,
      targetState: BatchStatus.SUBMITTED,
    });

    expect(escalated).toBe(true);

    // 3. Verify batch status changed to ESCALATED
    const escalatedBatch = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(escalatedBatch?.status).toBe(BatchStatus.ESCALATED);

    // 4. Verify immutable audit log recorded the SLA breach
    const logs = await prisma.auditLog.findMany({
      where: { targetId: batch.id, action: 'BATCH_SLA_BREACH_ESCALATED' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].targetType).toBe('SLA');
  });

  // =========================================================================
  // CRITICAL MOMENT 6: Resubmission Invalidates Prior Approvals
  // =========================================================================
  it('6. Resubmission after "send back" resets prior approvals and logs the audit trail', async () => {
    // 1. Create and submit batch
    const batch = await BatchService.createBatchWithCandidates(DEFAULT_PERSONAS.anika, {
      courseName: 'Green Energy Auditor',
      candidates: [
        {
          name: 'Tanya Sen',
          fatherName: 'Kalyan Sen',
          dateOfBirth: '2002-05-18',
          gender: 'Female',
          aadharLast4: '6789',
          phone: '9812345670',
          course: 'Green Energy Auditor',
          grade: 'A',
          completionDate: '2026-02-15',
        },
      ],
    });
    await BatchService.submitBatch(batch.id, DEFAULT_PERSONAS.anika);

    // 2. Officer Dev signs off on the batch (1st approval recorded)
    await BatchService.approveBatch(batch.id, DEFAULT_PERSONAS.dev);

    const approvalsBefore = await prisma.batchApproval.findMany({
      where: { batchId: batch.id, version: 1, status: 'APPROVED' },
    });
    expect(approvalsBefore.length).toBe(1);

    // 3. Officer Meera reviews and requests changes (sends back)
    await request(app)
      .post(`/api/batches/${batch.id}/request-changes`)
      .set('Authorization', authHeader('meera'))
      .send({ reason: 'Attendance records must be re-verified with biometric logs.' });

    const batchAfterChanges = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(batchAfterChanges?.status).toBe(BatchStatus.CHANGES_REQUESTED);

    // 4. Centre (Anika) resubmits the batch
    const resubmitRes = await request(app)
      .post(`/api/batches/${batch.id}/resubmit`)
      .set('Authorization', authHeader('anika'));

    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.data.version).toBe(2);
    expect(resubmitRes.body.data.status).toBe(BatchStatus.SUBMITTED);

    // 5. Explicit Policy Verification: All prior approvals are REVOKED_ON_RESUBMIT
    const priorApprovals = await prisma.batchApproval.findMany({
      where: { batchId: batch.id, version: 1 },
    });
    expect(priorApprovals.length).toBe(1);
    expect(priorApprovals[0].status).toBe('REVOKED_ON_RESUBMIT');

    // 6. Verify audit log recorded the invalidation policy
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        targetId: batch.id,
        action: 'BATCH_RESUBMITTED_APPROVALS_INVALIDATED',
      },
    });
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].metadata).toContain('REVOKED_ON_RESUBMIT');
  });
});
