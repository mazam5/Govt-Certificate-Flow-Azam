import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, whatsappQueue } from '../queues/queues.js';
import { createRedisConnection, redis } from '../config/redis.js';
import { prisma } from '../config/prisma.js';
import { CertificateService } from '../services/certificate.service.js';
import { AuditService } from '../services/audit.service.js';
import { sseHub } from '../events/sse.js';
import { DeliveryStatus } from '@prisma/client';

export const issuanceWorker = new Worker(
  QUEUE_NAMES.ISSUANCE,
  async (job: Job) => {
    const { batchId } = job.data;
    console.log(`🚀 [IssuanceWorker] Processing batch issuance for batchId: ${batchId}`);

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        centre: true,
        candidates: true,
      },
    });

    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    let issuedCount = 0;
    const totalCandidates = batch.candidates.length;

    for (const candidate of batch.candidates) {
      const idempotencyKey = `cert:issued:${batch.id}:${candidate.id}`;

      // Redis idempotency check
      const alreadyIssued = await redis.get(idempotencyKey);
      if (alreadyIssued) {
        issuedCount++;
        continue;
      }

      // Check DB if already issued
      let certificate = await prisma.certificate.findUnique({
        where: { candidateId: candidate.id },
      });

      if (!certificate) {
        // Generate unique certificate number
        let certNumber = CertificateService.generateCertificateNumber();
        let retries = 0;
        while (retries < 5) {
          const exists = await prisma.certificate.findUnique({ where: { certNumber } });
          if (!exists) break;
          certNumber = CertificateService.generateCertificateNumber();
          retries++;
        }

        // Generate real PDF with QR code
        const { filePath, qrDataUrl } = await CertificateService.generateCertificatePdf({
          certNumber,
          candidateName: candidate.name,
          courseName: candidate.course,
          centreName: batch.centre.name,
          district: batch.centre.district,
          grade: candidate.grade,
          completionDate: candidate.completionDate,
          issueDate: new Date(),
        });

        // Insert certificate with DB constraint safety
        certificate = await prisma.certificate.create({
          data: {
            certNumber,
            batchId: batch.id,
            candidateId: candidate.id,
            candidateName: candidate.name,
            courseName: candidate.course,
            centreName: batch.centre.name,
            district: batch.centre.district,
            issueDate: new Date(),
            pdfPath: filePath,
            qrCodeData: qrDataUrl,
          },
        });

        // Create initial pending DeliveryLog
        await prisma.deliveryLog.upsert({
          where: { candidateId: candidate.id },
          update: {},
          create: {
            certificateId: certificate.id,
            candidateId: candidate.id,
            phone: candidate.phone,
            status: DeliveryStatus.PENDING,
            attempts: 0,
          },
        });

        // Set Redis idempotency flag
        await redis.set(idempotencyKey, certNumber, 'EX', 86400 * 30);
      }

      issuedCount++;

      // Enqueue WhatsApp delivery job
      await whatsappQueue.add(
        'send-certificate-whatsapp',
        {
          certificateId: certificate.id,
          certNumber: certificate.certNumber,
          candidateId: candidate.id,
          candidateName: candidate.name,
          phone: candidate.phone,
          courseName: candidate.course,
          batchId: batch.id,
        },
        {
          jobId: `wa:${certificate.id}`, // Idempotent BullMQ job ID
        }
      );
    }

    // Audit log
    await AuditService.log({
      actorId: 'system-issuance-worker',
      actorName: 'Certificate Issuance Worker',
      role: 'SYSTEM',
      action: 'BATCH_CERTIFICATES_ISSUED',
      targetType: 'BATCH',
      targetId: batch.id,
      metadata: {
        batchNumber: batch.batchNumber,
        issuedCount,
        totalCandidates,
      },
    });

    sseHub.broadcast('BATCH_ISSUANCE_COMPLETED', {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      issuedCount,
      totalCandidates,
    });

    return { batchId, issuedCount };
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  }
);
