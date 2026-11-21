import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface JwtPayload {
  id: string;
  name: string;
  email: string;
  role: Role;
  district: string | null;
  centreId: string | null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'certiflow-pragati-secret-key-2026';
const JWT_EXPIRES_IN = '24h';

export class JwtService {
  public static sign(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'certiflow.pragati.gov.in',
    });
  }

  public static verify(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'certiflow.pragati.gov.in',
      });
      return decoded as JwtPayload;
    } catch (err) {
      return null;
    }
  }
}
