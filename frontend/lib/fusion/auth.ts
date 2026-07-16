import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = '1h';
const REFRESH_TOKEN_BYTES = 48;

export interface JwtPayload {
  sub: string;   // user id
  org: string;   // org id
  role: string;
}

export async function signAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ org: payload.org, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return {
    sub: payload.sub as string,
    org: payload['org'] as string,
    role: payload['role'] as string,
  };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiToken(): string {
  return `hx_${randomBytes(32).toString('base64url')}`;
}

export function generateAgentPassword(): string {
  return randomBytes(24).toString('base64url');
}

// 30 days
export function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
