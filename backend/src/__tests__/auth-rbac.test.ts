import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../config/prisma.js';
import { DEFAULT_PERSONAS } from '../middleware/auth.js';
import { JwtService } from '../services/jwt.service.js';
import { Role } from '@prisma/client';

describe('CertiFlow Zero-Trust Auth & RBAC Security Suite', () => {
  let testCertNumber: string;

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

    // Ensure personas exist in DB
    for (const p of Object.values(DEFAULT_PERSONAS)) {
      await prisma.user.upsert({
        where: { email: p.email },
        update: {
          name: p.name,
          role: p.role,
          district: p.district,
          centreId: p.role === Role.TRAINING_CENTRE ? centre.id : null,
        },
        create: {
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          district: p.district,
          centreId: p.role === Role.TRAINING_CENTRE ? centre.id : null,
        },
      });
    }

    // Seed a test certificate for verification & revocation checks
    const batch = await prisma.batch.create({
      data: {
        batchNumber: `TC-DISTA-AUTH-${Date.now()}`,
        centreId: centre.id,
        courseName: 'Solar Grid Technician',
        totalCandidates: 1,
        status: 'STATE_APPROVED',
        currentReviewLevel: 'COMPLETED',
        version: 1,
      },
    });

    const candidate = await prisma.candidate.create({
      data: {
        batchId: batch.id,
        name: 'Sunil Verma',
        fatherName: 'Ram Verma',
        dateOfBirth: '2001-04-10',
        gender: 'Male',
        aadharLast4: '7788',
        phone: '9811223344',
        course: 'Solar Grid Technician',
        grade: 'A',
        completionDate: '2026-02-15',
      },
    });

    testCertNumber = `PSM-2026-TEST${Math.floor(1000 + Math.random() * 9000)}`;
    await prisma.certificate.create({
      data: {
        certNumber: testCertNumber,
        candidateId: candidate.id,
        batchId: batch.id,
        candidateName: candidate.name,
        courseName: candidate.course,
        centreName: centre.name,
        district: centre.district,
        status: 'VALID',
        pdfPath: './storage/certificates/test.pdf',
        qrCodeData: 'data:image/png;base64,mock',
      },
    });
  });

  // =========================================================================
  // MOMENT 1: Unauthenticated Public Verification (Zero Auth Required)
  // =========================================================================
  it('1. Public unauthenticated requests to /api/verify/:certNumber succeed with zero PII leak', async () => {
    const res = await request(app).get(`/api/verify/${testCertNumber}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.valid).toBe(true);
    expect(res.body.data.certNumber).toBe(testCertNumber);
    expect(res.body.data.candidateName).toBe('Sunil Verma');
    expect(res.body.data.courseName).toBe('Solar Grid Technician');
    expect(res.body.data.status).toBe('VALID');

    // Strict zero-PII assertions
    expect(res.body.data.phone).toBeUndefined();
    expect(res.body.data.aadharLast4).toBeUndefined();
    expect(res.body.data.candidateId).toBeUndefined();
  });

  // =========================================================================
  // MOMENT 2: Zero-Trust Protected Internal Routes Reject Missing JWT
  // =========================================================================
  it('2. Unauthenticated requests to internal routes return 401 Unauthorized', async () => {
    // Batches endpoint
    const batchesRes = await request(app).get('/api/batches');
    expect(batchesRes.status).toBe(401);
    expect(batchesRes.body.success).toBe(false);

    // Certificates endpoint
    const certsRes = await request(app).get('/api/certificates');
    expect(certsRes.status).toBe(401);
    expect(certsRes.body.success).toBe(false);

    // Revocation endpoint without token
    const revokeRes = await request(app)
      .post(`/api/certificates/${testCertNumber}/revoke`)
      .send({ reason: 'Fraudulent submission' });
    expect(revokeRes.status).toBe(401);
    expect(revokeRes.body.success).toBe(false);
  });

  // =========================================================================
  // MOMENT 3: Strict RBAC Guard (Wrong Role Gets 403 Forbidden)
  // =========================================================================
  it('3. Wrong-role JWT tokens are rejected with 403 Forbidden', async () => {
    // Anika (TRAINING_CENTRE) attempts to revoke certificate -> MUST FAIL 403
    const anikaToken = JwtService.sign(DEFAULT_PERSONAS.anika);
    const anikaRevokeRes = await request(app)
      .post(`/api/certificates/${testCertNumber}/revoke`)
      .set('Authorization', `Bearer ${anikaToken}`)
      .send({ reason: 'Unauthorized revocation attempt' });

    expect(anikaRevokeRes.status).toBe(403);
    expect(anikaRevokeRes.body.error).toContain('Forbidden');

    // Dev (DISTRICT_OFFICER) attempts to revoke certificate -> MUST FAIL 403
    const devToken = JwtService.sign(DEFAULT_PERSONAS.dev);
    const devRevokeRes = await request(app)
      .post(`/api/certificates/${testCertNumber}/revoke`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ reason: 'Unauthorized revocation attempt' });

    expect(devRevokeRes.status).toBe(403);
    expect(devRevokeRes.body.error).toContain('Forbidden');

    // Only Farah (STATE_OFFICE) is authorized to revoke
    const farahToken = JwtService.sign(DEFAULT_PERSONAS.farah);
    const farahRevokeRes = await request(app)
      .post(`/api/certificates/${testCertNumber}/revoke`)
      .set('Authorization', `Bearer ${farahToken}`)
      .send({ reason: 'Legitimate State Directorate revocation order' });

    expect(farahRevokeRes.status).toBe(200);
    expect(farahRevokeRes.body.success).toBe(true);
    expect(farahRevokeRes.body.data.status).toBe('REVOKED');
  });

  // =========================================================================
  // MOMENT 4: Login Endpoint Issues Signed JWT
  // =========================================================================
  it('4. POST /api/auth/login validates payload and issues real signed JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'farah@state.pragati.gov.in',
        password: 'anyPassword123',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.name).toBe('Farah');
    expect(res.body.data.user.role).toBe('STATE_OFFICE');

    // Verify token cryptographically
    const verified = JwtService.verify(res.body.data.token);
    expect(verified).not.toBeNull();
    expect(verified?.role).toBe('STATE_OFFICE');
  });

  // =========================================================================
  // MOMENT 5: 1-Click Demo Persona Switcher Issues Valid JWT
  // =========================================================================
  it('5. POST /api/auth/demo-switch swaps persona and generates signed token respecting role boundaries', async () => {
    // Switch to Neha (Quality Team)
    const switchRes = await request(app)
      .post('/api/auth/demo-switch')
      .send({ persona: 'neha' });

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.success).toBe(true);
    expect(switchRes.body.data.user.name).toBe('Neha');
    expect(switchRes.body.data.user.role).toBe('QUALITY_TEAM');

    const nehaToken = switchRes.body.data.token;
    expect(nehaToken).toBeDefined();

    // Verify access to /api/auth/me with Neha's token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${nehaToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.name).toBe('Neha');
    expect(meRes.body.data.role).toBe('QUALITY_TEAM');
  });
});
