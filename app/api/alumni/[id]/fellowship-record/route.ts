import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCheckins, fetchStatusReports, fetchEvents, fetchEventAttendance } from '@/lib/sheets';

/**
 * GET /api/alumni/[id]/fellowship-record — read-only.
 *
 * Everything the dashboard logged about this person while they were a fellow:
 * check-ins, monthly status reports, and event attendance. These rows stay in
 * their own tabs after Move to Alumni (the person keeps the same ID), so this
 * only reads and joins them; nothing here writes.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const [checkins, reports, events, attendance] = await Promise.all([
      fetchCheckins(id),
      fetchStatusReports(id),
      fetchEvents(),
      fetchEventAttendance(),
    ]);
    const eventsById = new Map(events.map((e) => [e.id, e]));
    const eventRows = attendance
      .filter((a) => a.fellow_id === id)
      .map((a) => {
        const e = eventsById.get(a.event_id);
        return {
          event_id: a.event_id,
          name: e?.name || 'Event no longer listed',
          date: e?.date || '',
          required: e?.required ?? false,
          attended: a.attended,
        };
      });
    return NextResponse.json({ checkins, reports, events: eventRows });
  } catch (err) {
    console.error('Failed to load fellowship record:', err);
    return NextResponse.json({ error: 'Failed to load the fellowship record' }, { status: 500 });
  }
}
