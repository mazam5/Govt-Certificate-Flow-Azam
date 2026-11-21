import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { batchRouter } from './batch.routes.js';
import { certificateRouter } from './certificate.routes.js';
import { verifyRouter } from './verify.routes.js';
import { eventRouter } from './event.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/batches', batchRouter);
apiRouter.use('/certificates', certificateRouter);
apiRouter.use('/verify', verifyRouter);
apiRouter.use('/events', eventRouter);
