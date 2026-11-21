import { Router } from 'express';
import { CertificateController } from '../controllers/certificate.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';

export const certificateRouter = Router();

// Internal certificate routes are strictly authenticated
certificateRouter.use(requireAuth);

certificateRouter.get('/', CertificateController.getCertificates);
certificateRouter.get('/:certNumber/pdf', CertificateController.downloadPdf);

// Only State Office (Farah) can revoke certificates
certificateRouter.post(
  '/:certNumber/revoke',
  requireRole(Role.STATE_OFFICE),
  CertificateController.revokeCertificate
);
