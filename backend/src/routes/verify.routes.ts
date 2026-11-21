import { Router } from 'express';
import { VerifyController } from '../controllers/verify.controller.js';
import { CertificateController } from '../controllers/certificate.controller.js';

export const verifyRouter = Router();

// Unauthenticated public verification & downloads
verifyRouter.get('/:certNumber', VerifyController.verify);
verifyRouter.get('/:certNumber/download', CertificateController.downloadPdf);
verifyRouter.get('/:certNumber/pdf', CertificateController.downloadPdf);
