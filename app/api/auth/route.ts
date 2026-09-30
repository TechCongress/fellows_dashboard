import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'crypto';
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken } from '@/lib/auth';

// Slow down password guessing: after MAX_FAILURES wrong passwords from one
// address, further attempts are refused until the window passes. This lives in
// memory, so it's per server instance and resets on redeploy. It stops casual
// guessing, not a determined distributed attack.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientAddress(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** Compare two strings without leaking, through timing, how much of them matched. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  const expected = process.env.DASHBOARD_PASSWORD || '';
  // Fail closed: with no password configured, nobody can log in. (An empty
  // password used to match a request that sent no password at all.)
  if (!expected) {
    console.error('DASHBOARD_PASSWORD is not set; refusing all logins.');
    return NextResponse.json({ error: 'Login is not configured.' }, { status: 503 });
  }

  const ip = clientAddress(req);
  const now = Date.now();
  const record = failures.get(ip);
  if (record && record.resetAt > now && record.count >= MAX_FAILURES) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !sameSecret(password, expected)) {
    const fresh = !record || record.resetAt <= now;
    failures.set(ip, { count: fresh ? 1 : record.count + 1, resetAt: fresh ? now + WINDOW_MS : record.resetAt });
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  failures.delete(ip);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: '/',
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
