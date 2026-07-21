import { createHash, randomBytes } from 'crypto';

/** SHA-256 hash of an opaque or signed token, used so raw tokens are never persisted. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cryptographically random, URL-safe single-use token (e.g. password reset, OAuth ticket). */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses a JWT-style duration ("15m", "7d") into an absolute expiry Date from now. */
export function parseDurationToDate(duration: string, fallbackMs = 7 * 86_400_000): Date {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    return new Date(Date.now() + fallbackMs);
  }
  const value = Number(match[1]);
  return new Date(Date.now() + value * DURATION_UNIT_MS[match[2]]);
}
