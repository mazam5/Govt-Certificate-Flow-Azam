import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.get('/personas', AuthController.getPersonas);
authRouter.get('/me', AuthController.getCurrentUser);
