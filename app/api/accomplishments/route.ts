import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { fetchAccomplishments } from '@/lib/sheets';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const accomplishments = await fetchAccomplishments();
    return NextResponse.json(accomplishments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[accomplishments]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
