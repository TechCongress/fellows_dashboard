import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchEventAttendance, saveAttendanceBatch } from '@/lib/sheets';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const attendance = await fetchEventAttendance();
  return NextResponse.json(attendance);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { eventId, attendanceMap } = await req.json();
  const ok = await saveAttendanceBatch(eventId, attendanceMap);
  return NextResponse.json({ ok });
}
