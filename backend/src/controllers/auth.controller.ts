import { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { DEFAULT_PERSONAS } from '../middleware/auth.js';
import { JwtService } from '../services/jwt.service.js';

export class AuthController {
  public static async getPersonas(req: Request, res: Response): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        include: {
          centre: true,
        },
      });

      const personasToReturn = users.length > 0 ? users : Object.values(DEFAULT_PERSONAS);

      const enriched = personasToReturn.map((user) => ({
        ...user,
        token: JwtService.sign({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          district: user.district,
          centreId: user.centreId,
        }),
      }));

      res.json({
        success: true,
        data: enriched,
      });
    } catch (err) {
      const fallback = Object.values(DEFAULT_PERSONAS).map((user) => ({
        ...user,
        token: JwtService.sign(user),
      }));
      res.json({
        success: true,
        data: fallback,
      });
    }
  }

  public static async switchPersona(req: Request, res: Response): Promise<void> {
    const { persona } = req.body;
    const cleanKey = (persona || '').toLowerCase();
    const personaUser = DEFAULT_PERSONAS[cleanKey];

    if (!personaUser) {
      res.status(404).json({
        success: false,
        error: `Persona '${persona}' not recognized. Available: anika, dev, meera, kabir, neha, farah`,
      });
      return;
    }

    const token = JwtService.sign(personaUser);

    res.json({
      success: true,
      data: {
        user: personaUser,
        token,
      },
    });
  }

  public static async getCurrentUser(req: Request, res: Response): Promise<void> {
    const user = req.user || null;
    res.json({
      success: true,
      data: user ? {
        ...user,
        token: JwtService.sign(user),
      } : null,
    });
  }
}
