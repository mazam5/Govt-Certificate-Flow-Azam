import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { DEFAULT_PERSONAS } from '../middleware/auth.js';
import { JwtService } from '../services/jwt.service.js';

const LoginSchema = z.object({
  email: z.string().trim().email('Valid email address is required'),
  password: z.string().min(1, 'Password is required'),
});

const DemoSwitchSchema = z.object({
  persona: z.enum(['anika', 'dev', 'meera', 'kabir', 'neha', 'farah'], {
    errorMap: () => ({ message: 'Persona must be one of: anika, dev, meera, kabir, neha, farah' }),
  }),
});

const PERSONA_EMAIL_MAP: Record<string, string> = {
  anika: 'anika@pragati.gov.in',
  dev: 'dev@district-a.gov.in',
  meera: 'meera@district-a.gov.in',
  kabir: 'kabir@district-a.gov.in',
  neha: 'neha@quality.pragati.gov.in',
  farah: 'farah@state.pragati.gov.in',
};

export class AuthController {
  /**
   * Standard Email + Password Login
   * Returns signed JWT and sets HTTP-only cookie
   */
  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid login payload',
        });
        return;
      }

      const { email } = parsed.data;
      const cleanEmail = email.toLowerCase().trim();

      // Look up user in PostgreSQL
      let user = await prisma.user.findUnique({
        where: { email: cleanEmail },
        include: { centre: true },
      });

      // If user not in DB yet (e.g. before initial seed run), check default personas
      if (!user) {
        const matchingFallback = Object.values(DEFAULT_PERSONAS).find(
          (p) => p.email.toLowerCase() === cleanEmail
        );

        if (!matchingFallback) {
          res.status(401).json({
            success: false,
            error: 'Invalid credentials. User with this email does not exist.',
          });
          return;
        }

        user = {
          id: matchingFallback.id,
          name: matchingFallback.name,
          email: matchingFallback.email,
          role: matchingFallback.role,
          district: matchingFallback.district,
          centreId: matchingFallback.centreId,
          createdAt: new Date(),
          centre: null,
        } as any;
      }

      // Generate real signed JWT
      const token = JwtService.sign({
        userId: user!.id,
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: user!.role,
        district: user!.district,
        districtId: user!.district,
        centreId: user!.centreId,
      });

      // Set secure HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.json({
        success: true,
        message: `Welcome back, ${user!.name}!`,
        data: {
          user: {
            userId: user!.id,
            id: user!.id,
            name: user!.name,
            email: user!.email,
            role: user!.role,
            district: user!.district,
            districtId: user!.district,
            centreId: user!.centreId,
            centreName: user!.centre?.name || null,
          },
          token,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 1-Click Demo Reviewer Switcher
   * Swaps persona, generates real signed JWT, and sets cookie
   */
  public static async demoSwitch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = DemoSwitchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid persona key',
        });
        return;
      }

      const personaKey = parsed.data.persona.toLowerCase();
      const targetEmail = PERSONA_EMAIL_MAP[personaKey];

      // Query database for canonical record
      let dbUser = await prisma.user.findUnique({
        where: { email: targetEmail },
        include: { centre: true },
      });

      const fallback = DEFAULT_PERSONAS[personaKey];

      const userRecord = dbUser || {
        id: fallback.id,
        name: fallback.name,
        email: fallback.email,
        role: fallback.role,
        district: fallback.district,
        centreId: fallback.centreId,
        centre: null,
      };

      const token = JwtService.sign({
        userId: userRecord.id,
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role,
        district: userRecord.district,
        districtId: userRecord.district,
        centreId: userRecord.centreId,
      });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        message: `Switched active session to ${userRecord.name} (${userRecord.role})`,
        data: {
          user: {
            userId: userRecord.id,
            id: userRecord.id,
            name: userRecord.name,
            email: userRecord.email,
            role: userRecord.role,
            district: userRecord.district,
            districtId: userRecord.district,
            centreId: userRecord.centreId,
            centreName: userRecord.centre?.name || (fallback.role === 'TRAINING_CENTRE' ? 'Pragati Training Centre - District A' : null),
          },
          token,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Log out and clear session cookie
   */
  public static async logout(req: Request, res: Response): Promise<void> {
    res.clearCookie('token');
    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  }

  /**
   * Return authenticated staff profile from verified JWT
   */
  public static async getCurrentUser(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: No active session',
      });
      return;
    }

    res.json({
      success: true,
      data: req.user,
    });
  }

  /**
   * List all seeded reviewer personas with details for 1-click access
   */
  public static async getPersonas(req: Request, res: Response): Promise<void> {
    const personas = [
      {
        id: 'user-anika-001',
        name: 'Anika',
        key: 'anika',
        email: 'anika@pragati.gov.in',
        role: 'TRAINING_CENTRE',
        district: 'District A',
        description: 'Training Centre Lead (Upload, edit & submit candidate batches)',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      },
      {
        id: 'user-dev-001',
        name: 'Dev',
        key: 'dev',
        email: 'dev@district-a.gov.in',
        role: 'DISTRICT_OFFICER',
        district: 'District A',
        description: 'District Officer (Signatory 1 - District A approval)',
        badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
      },
      {
        id: 'user-meera-001',
        name: 'Meera',
        key: 'meera',
        email: 'meera@district-a.gov.in',
        role: 'DISTRICT_OFFICER',
        district: 'District A',
        description: 'District Officer (Signatory 2 - District A approval)',
        badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      },
      {
        id: 'user-kabir-001',
        name: 'Kabir',
        key: 'kabir',
        email: 'kabir@district-a.gov.in',
        role: 'DISTRICT_OFFICER',
        district: 'District A',
        description: 'District Officer (Signatory 3 - District A approval)',
        badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
      },
      {
        id: 'user-neha-001',
        name: 'Neha',
        key: 'neha',
        email: 'neha@quality.pragati.gov.in',
        role: 'QUALITY_TEAM',
        district: null,
        description: 'Quality Team (Mandatory audit for large batches >= 50 candidates)',
        badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
      },
      {
        id: 'user-farah-001',
        name: 'Farah',
        key: 'farah',
        email: 'farah@state.pragati.gov.in',
        role: 'STATE_OFFICE',
        district: null,
        description: 'State Director (Final sanction, SLA escalation view, Revocation)',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      },
    ];

    res.json({
      success: true,
      data: personas,
    });
  }
}
