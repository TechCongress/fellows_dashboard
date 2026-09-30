/**
 * Login sessions.
 * ───────────────
 * Logging in sets a `tc-auth` cookie holding a signed token that expires after
 * SESSION_DAYS. The token is signed with a key only the server knows, so a
 * cookie someone types in by hand fails verification. (The cookie used to hold
 * the fixed word "authenticated", which anyone could set in their own browser.)
 *
 * The signing key is AUTH_SECRET when set; otherwise it's derived from
 * DASHBOARD_PASSWORD, which means changing the password logs everyone out.
 * With neither set there is no key, and every check fails closed.
 *
 * Used by middleware.ts (Edge runtime) and the API routes (Node runtime), so it
 * only uses Web Crypto and `jose`, which run in both. The route-only helper
 * that reads the request's cookies lives in lib/auth-server.ts.
 */

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'tc-auth';
export const SESSION_DAYS = 7;

async function signingKey(): Promise<Uint8Array | null> {
  const secret = process.env.AUTH_SECRET || '';
  if (secret) return new TextEncoder().encode(secret);
  const password = process.env.DASHBOARD_PASSWORD || '';
  if (!password) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tc-auth-session-v1:${password}`));
  return new Uint8Array(digest);
}

export async function createSessionToken(): Promise<string> {
  const key = await signingKey();
  if (!key) throw new Error('DASHBOARD_PASSWORD is not set');
  return new SignJWT({ scope: 'dashboard' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const key = await signingKey();
  if (!key) return false;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return payload.scope === 'dashboard';
  } catch {
    return false; // bad signature, expired, or not a token at all
  }
}
