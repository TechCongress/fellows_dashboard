import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchEvents, addEvent, updateEvent } from '@/lib/sheets';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const events = await fetchEvents();
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (body.id) {
    const ok = await updateEvent(body.id, body);
    return NextResponse.json({ ok });
  } else {
    const ok = await addEvent(body);
    return NextResponse.json({ ok });
  }
}
