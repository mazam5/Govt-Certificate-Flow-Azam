import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { JwtService, JwtPayload } from '../services/jwt.service.js';

export interface AuthenticatedUser {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  district: string | null;
  districtId: string | null;
  centreId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Canonical seed definitions for quick lookup / fallback
export const DEFAULT_PERSONAS: Record<string, AuthenticatedUser> = {
  anika: {
    id: 'user-anika-001',
    userId: 'user-anika-001',
    name: 'Anika',
    email: 'anika@pragati.gov.in',
    role: Role.TRAINING_CENTRE,
    district: 'District A',
    districtId: 'District A',
    centreId: 'tc-dista-001',
  },
  dev: {
    id: 'user-dev-001',
    userId: 'user-dev-001',
    name: 'Dev',
    email: 'dev@district-a.gov.in',
    role: Role.DISTRICT_OFFICER,
    district: 'District A',
    districtId: 'District A',
    centreId: null,
  },
  meera: {
    id: 'user-meera-001',
    userId: 'user-meera-001',
    name: 'Meera',
    email: 'meera@district-a.gov.in',
    role: Role.DISTRICT_OFFICER,
    district: 'District A',
    districtId: 'District A',
    centreId: null,
  },
  kabir: {
    id: 'user-kabir-001',
    userId: 'user-kabir-001',
    name: 'Kabir',
    email: 'kabir@district-a.gov.in',
    role: Role.DISTRICT_OFFICER,
    district: 'District A',
    districtId: 'District A',
    centreId: null,
  },
  neha: {
    id: 'user-neha-001',
    userId: 'user-neha-001',
    name: 'Neha',
    email: 'neha@quality.pragati.gov.in',
    role: Role.QUALITY_TEAM,
    district: null,
    districtId: null,
    centreId: null,
  },
  farah: {
    id: 'user-farah-001',
    userId: 'user-farah-001',
    name: 'Farah',
    email: 'farah@state.pragati.gov.in',
    role: Role.STATE_OFFICE,
    district: null,
    districtId: null,
    centreId: null,
  },
};

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const item of cookieHeader.split(';')) {
    const parts = item.trim().split('=');
    if (parts.length >= 2) {
      const key = parts[0];
      const val = parts.slice(1).join('=');
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

/**
 * Zero-Trust JWT Authentication Middleware
 * Validates real signed JWT tokens from:
 * 1. Authorization: Bearer <token>
 * 2. ?token=<token> (for Server-Sent Events EventSource connections)
 * 3. Cookie: token=<token>
 *
 * Extracts actor credentials exclusively from the verified token.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | null = null;

    // 1. Authorization Bearer JWT Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.query.token && typeof req.query.token === 'string') {
      // 2. Query parameter (used by EventSource SSE client)
      token = req.query.token.trim();
    } else if (req.headers.cookie) {
      // 3. HTTP-only cookie
      const parsed = parseCookies(req.headers.cookie);
      if (parsed.token) {
        token = parsed.token;
      }
    }

    if (token) {
      const payload: JwtPayload | null = JwtService.verify(token);
      if (payload) {
        req.user = {
          id: payload.id || payload.userId,
          userId: payload.userId || payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          district: payload.district ?? payload.districtId ?? null,
          districtId: payload.districtId ?? payload.district ?? null,
          centreId: payload.centreId ?? null,
        };
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Enforce that the request has a valid, verified JWT token
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication token required or invalid',
    });
    return;
  }
  next();
}

/**
 * Enforce that the authenticated user possesses one of the allowed roles
 */
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
