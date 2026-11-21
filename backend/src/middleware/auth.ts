import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  district: string | null;
  centreId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Fallback seed definitions if DB lookup needs immediate persona resolution
export const DEFAULT_PERSONAS: Record<string, AuthenticatedUser> = {
  anika: {
    id: 'user-anika-001',
    name: 'Anika',
    email: 'anika@pragati.gov.in',
    role: Role.TRAINING_CENTRE,
    district: 'District A',
    centreId: 'tc-dista-001',
  },
  dev: {
    id: 'user-dev-001',
    name: 'Dev',
    email: 'dev@district-a.gov.in',
    role: Role.DISTRICT_OFFICER,
    district: 'District A',
    centreId: null,
  },
  meera: {
    id: 'user-meera-001',
    name: 'Meera',
    email: 'meera@district-a.gov.in',
    role: Role.DISTRICT_OFFICER,
    district: 'District A',
    centreId: null,
  },
  kabir: {
    id: 'user-kabir-001',
    name: 'Kabir',
    email: 'kabir@district-a.gov.in',
    role: Role.DISTRICT_OFFICER,
    district: 'District A',
    centreId: null,
  },
  neha: {
    id: 'user-neha-001',
    name: 'Neha',
    email: 'neha@quality.pragati.gov.in',
    role: Role.QUALITY_TEAM,
    district: null,
    centreId: null,
  },
  farah: {
    id: 'user-farah-001',
    name: 'Farah',
    email: 'farah@state.pragati.gov.in',
    role: Role.STATE_OFFICE,
    district: null,
    centreId: null,
  },
};

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userIdHeader = (req.headers['x-user-id'] as string) || '';
    const personaHeader = (req.headers['x-persona'] as string || '').toLowerCase();

    let user: AuthenticatedUser | null = null;

    if (userIdHeader) {
      // First check DB
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userIdHeader },
        });
        if (dbUser) {
          user = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            district: dbUser.district,
            centreId: dbUser.centreId,
          };
        }
      } catch (err) {
        // Fallback to static lookup if DB is reconnecting
      }

      // If not found in DB, check by ID in DEFAULT_PERSONAS
      if (!user) {
        const found = Object.values(DEFAULT_PERSONAS).find((p) => p.id === userIdHeader);
        if (found) user = found;
      }
    } else if (personaHeader && DEFAULT_PERSONAS[personaHeader]) {
      user = DEFAULT_PERSONAS[personaHeader];
    }

    // Default to Anika (Training Centre) if unassigned authenticated route
    if (!user && req.path.startsWith('/api') && !req.path.startsWith('/api/verify') && !req.path.startsWith('/api/events')) {
      user = DEFAULT_PERSONAS.anika;
    }

    req.user = user || undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role. Current: ${req.user.role}`,
      });
      return;
    }

    next();
  };
}
