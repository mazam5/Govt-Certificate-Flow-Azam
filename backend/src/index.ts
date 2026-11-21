import { app } from './app.js';
import { config } from './config/env.js';
import { prisma } from './config/prisma.js';
import { DEFAULT_PERSONAS } from './middleware/auth.js';
import { Role } from '@prisma/client';
import { startWorkers } from './workers/index.js';
import { CertificateService } from './services/certificate.service.js';

async function ensureSeedData() {
  try {
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

    // Ensure dedicated demo verification credentials exist
    const demoBatch = await prisma.batch.upsert({
      where: { id: 'batch-demo-seed-001' },
      update: {},
      create: {
        id: 'batch-demo-seed-001',
        batchNumber: 'BATCH-DEMO-2026-001',
        centreId: centre.id,
        courseName: 'Solar PV Installation Technician',
        totalCandidates: 3,
        status: 'STATE_APPROVED',
      },
    });

    const demoCandidate1 = await prisma.candidate.upsert({
      where: { id: 'cand-demo-001' },
      update: {},
      create: {
        id: 'cand-demo-001',
        batchId: demoBatch.id,
        name: 'Rohan Sharma',
        fatherName: 'Prakash Sharma',
        dateOfBirth: '2001-05-14',
        gender: 'Male',
        aadharLast4: '4821',
        phone: '9876543210',
        course: 'Solar PV Installation Technician',
        grade: 'A',
        completionDate: '2026-02-15',
      },
    });

    const demoCandidate2 = await prisma.candidate.upsert({
      where: { id: 'cand-demo-002' },
      update: {},
      create: {
        id: 'cand-demo-002',
        batchId: demoBatch.id,
        name: 'Priya Patel',
        fatherName: 'Bimal Patel',
        dateOfBirth: '2002-08-22',
        gender: 'Female',
        aadharLast4: '9123',
        phone: '9812345678',
        course: 'Healthcare General Duty Assistant',
        grade: 'A+',
        completionDate: '2026-02-15',
      },
    });

    const demoCandidate3 = await prisma.candidate.upsert({
      where: { id: 'cand-demo-003' },
      update: {},
      create: {
        id: 'cand-demo-003',
        batchId: demoBatch.id,
        name: 'Aaditya Rao',
        fatherName: 'Gopal Rao',
        dateOfBirth: '1999-04-12',
        gender: 'Male',
        aadharLast4: '3321',
        phone: '9845012345',
        course: 'Quality Inspection & Metrology',
        grade: 'B',
        completionDate: '2026-01-20',
      },
    });

    // 1. Guaranteed Valid Demo Certificate 1
    const cert1 = await prisma.certificate.findUnique({ where: { certNumber: 'PSM-2026-DEMO01' } });
    if (!cert1) {
      const { filePath, qrDataUrl } = await CertificateService.generateCertificatePdf({
        certNumber: 'PSM-2026-DEMO01',
        candidateName: demoCandidate1.name,
        courseName: demoCandidate1.course,
        centreName: centre.name,
        district: centre.district,
        grade: demoCandidate1.grade,
        completionDate: demoCandidate1.completionDate,
        issueDate: new Date(),
      });
      await prisma.certificate.create({
        data: {
          certNumber: 'PSM-2026-DEMO01',
          batchId: demoBatch.id,
          candidateId: demoCandidate1.id,
          candidateName: demoCandidate1.name,
          courseName: demoCandidate1.course,
          centreName: centre.name,
          district: centre.district,
          issueDate: new Date(),
          status: 'VALID',
          pdfPath: filePath,
          qrCodeData: qrDataUrl,
        },
      });
    }

    // 2. Guaranteed Valid Demo Certificate 2
    const cert2 = await prisma.certificate.findUnique({ where: { certNumber: 'PSM-2026-DEMO02' } });
    if (!cert2) {
      const { filePath, qrDataUrl } = await CertificateService.generateCertificatePdf({
        certNumber: 'PSM-2026-DEMO02',
        candidateName: demoCandidate2.name,
        courseName: demoCandidate2.course,
        centreName: centre.name,
        district: centre.district,
        grade: demoCandidate2.grade,
        completionDate: demoCandidate2.completionDate,
        issueDate: new Date(),
      });
      await prisma.certificate.create({
        data: {
          certNumber: 'PSM-2026-DEMO02',
          batchId: demoBatch.id,
          candidateId: demoCandidate2.id,
          candidateName: demoCandidate2.name,
          courseName: demoCandidate2.course,
          centreName: centre.name,
          district: centre.district,
          issueDate: new Date(),
          status: 'VALID',
          pdfPath: filePath,
          qrCodeData: qrDataUrl,
        },
      });
    }

    // 3. Guaranteed Revoked Demo Certificate
    const cert3 = await prisma.certificate.findUnique({ where: { certNumber: 'PSM-2026-REVOKED' } });
    if (!cert3) {
      const { filePath, qrDataUrl } = await CertificateService.generateCertificatePdf({
        certNumber: 'PSM-2026-REVOKED',
        candidateName: demoCandidate3.name,
        courseName: demoCandidate3.course,
        centreName: centre.name,
        district: centre.district,
        grade: demoCandidate3.grade,
        completionDate: demoCandidate3.completionDate,
        issueDate: new Date(),
      });
      await prisma.certificate.create({
        data: {
          certNumber: 'PSM-2026-REVOKED',
          batchId: demoBatch.id,
          candidateId: demoCandidate3.id,
          candidateName: demoCandidate3.name,
          courseName: demoCandidate3.course,
          centreName: centre.name,
          district: centre.district,
          issueDate: new Date(),
          status: 'REVOKED',
          revokedAt: new Date(),
          revocationReason: 'State Directorate audit discrepancy identified during post-issuance review.',
          pdfPath: filePath,
          qrCodeData: qrDataUrl,
        },
      });
    }

    console.log('🌱 Seed personas and demo verification credentials verified in PostgreSQL.');
  } catch (err: any) {
    console.warn('Notice: Seed sync notice:', err.message);
  }
}

async function bootstrap() {
  try {
    // Ensure seeded review personas and training centres exist in PostgreSQL
    await ensureSeedData();

    // Start background workers in same process for convenience in local dev
    if (process.env.START_WORKERS !== 'false') {
      startWorkers();
    }

    app.listen(config.port, () => {
      console.log(`✨ CertiFlow API Server running at http://localhost:${config.port}`);
      console.log(`🌐 Environment: ${config.nodeEnv}`);
      console.log(`📡 Real-time SSE Stream: http://localhost:${config.port}/api/events/stream`);
      console.log(`🔍 Public Verification: http://localhost:${config.port}/api/verify/:certNumber`);
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

bootstrap();
