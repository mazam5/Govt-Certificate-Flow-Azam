import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// Public auth endpoints
authRouter.get('/personas', AuthController.getPersonas);
authRouter.post('/login', AuthController.login);
authRouter.post('/demo-switch', AuthController.demoSwitch);
authRouter.post('/switch', AuthController.demoSwitch); // Alias for compatibility
authRouter.post('/logout', AuthController.logout);

// Protected auth endpoint
authRouter.get('/me', requireAuth, AuthController.getCurrentUser);
