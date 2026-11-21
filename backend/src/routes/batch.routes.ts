import { Router } from 'express';
import { BatchController, upload } from '../controllers/batch.controller.js';
import { requireRole } from '../middleware/auth.js';
import { Role } from '@prisma/client';

export const batchRouter = Router();

batchRouter.get('/', BatchController.getBatches);
batchRouter.get('/sample-csv', BatchController.downloadSampleCsv);
batchRouter.get('/:id', BatchController.getBatchById);
batchRouter.get('/:id/escalation-summary', BatchController.getEscalationSummary);

// Training Centre upload & submission
batchRouter.post(
  '/upload',
  requireRole(Role.TRAINING_CENTRE),
  upload.single('file'),
  BatchController.uploadBatch
);

batchRouter.post(
  '/:id/submit',
  requireRole(Role.TRAINING_CENTRE),
  BatchController.submitBatch
);

batchRouter.post(
  '/:id/resubmit',
  requireRole(Role.TRAINING_CENTRE),
  upload.single('file'),
  BatchController.resubmitBatch
);

// Reviewer approval
batchRouter.post(
  '/:id/approve',
  requireRole(Role.DISTRICT_OFFICER, Role.QUALITY_TEAM, Role.STATE_OFFICE),
  BatchController.approveBatch
);

// Reviewer request changes
batchRouter.post(
  '/:id/request-changes',
  requireRole(Role.DISTRICT_OFFICER, Role.QUALITY_TEAM, Role.STATE_OFFICE),
  BatchController.requestChanges
);
