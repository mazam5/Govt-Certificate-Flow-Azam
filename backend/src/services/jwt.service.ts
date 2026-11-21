import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  id: string;
  name: string;
  email: string;
  role: Role;
  district: string | null;
  districtId: string | null;
  centreId: string | null;
}

const JWT_SECRET = process.env.JWT_SECRET || 'certiflow-pragati-secret-key-2026';
const JWT_EXPIRES_IN = '24h';

export class JwtService {
  public static sign(payload: {
    id?: string;
    userId?: string;
    name: string;
    email: string;
    role: Role;
    district?: string | null;
    districtId?: string | null;
    centreId?: string | null;
  }): string {
    const id = payload.id || payload.userId || '';
    const district = payload.district ?? payload.districtId ?? null;

    const tokenPayload: JwtPayload = {
      id,
      userId: id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      district,
      districtId: district,
      centreId: payload.centreId ?? null,
    };

    return jwt.sign(tokenPayload, JWT_SECRET, {
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
