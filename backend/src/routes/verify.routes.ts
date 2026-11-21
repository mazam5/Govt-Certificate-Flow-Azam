import { Router } from 'express';
import { VerifyController } from '../controllers/verify.controller.js';

export const verifyRouter = Router();

// Unauthenticated public verification
verifyRouter.get('/:certNumber', VerifyController.verify);
