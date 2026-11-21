import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { DEFAULT_PERSONAS } from '../middleware/auth.js';

export class AuthController {
  public static async getPersonas(req: Request, res: Response): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        include: {
          centre: true,
        },
      });

      if (users.length > 0) {
        res.json({
          success: true,
          data: users,
        });
        return;
      }

      // Fallback to static list if DB not seeded yet
      res.json({
        success: true,
        data: Object.values(DEFAULT_PERSONAS),
      });
    } catch (err) {
      res.json({
        success: true,
        data: Object.values(DEFAULT_PERSONAS),
      });
    }
  }

  public static async getCurrentUser(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: req.user || null,
    });
  }
}
