import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchEventAttendance, saveAttendanceBatch } from '@/lib/sheets';

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await fetchEventAttendance());
  } catch (err) {
    console.error('Failed to fetch attendance:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { eventId, attendanceMap } = await req.json();
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    const ok = await saveAttendanceBatch(eventId, attendanceMap);
    if (!ok) return NextResponse.json({ error: 'Attendance was not saved. Please try again.' }, { status: 500 });
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to save attendance:', err);
    return NextResponse.json({ error: 'Attendance was not saved. Please try again.' }, { status: 500 });
  }
}
