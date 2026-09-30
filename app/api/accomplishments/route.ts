import { isAuthed } from '@/lib/auth-server';
import { NextResponse } from 'next/server';
import { fetchAccomplishments } from '@/lib/sheets';

const authed = isAuthed;

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const accomplishments = await fetchAccomplishments();
    return NextResponse.json(accomplishments);
  } catch (err: unknown) {
    // Details stay in the server log; the browser gets a generic message.
    console.error('[accomplishments]', err);
    return NextResponse.json({ error: 'Failed to load accomplishments' }, { status: 500 });
  }
}
