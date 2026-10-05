import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAlumniEngagements, addAlumniEngagement, updateAlumniEngagement, deleteAlumniEngagement } from '@/lib/sheets';
import { ENGAGEMENT_TYPES, todayISOET } from '@/lib/helpers';

const authed = isAuthed;

/** GET /api/alumni-engagement?alumniId=… — one alum's logged engagements (or everyone's). */
export async function GET(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const alumniId = req.nextUrl.searchParams.get('alumniId') || undefined;
  try {
    return NextResponse.json(await fetchAlumniEngagements(alumniId));
  } catch (err) {
    console.error('Failed to fetch alumni engagements:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

/**
 * POST /api/alumni-engagement — log an engagement.
 * Body: { alumni_id, date: 'YYYY-MM-DD', engagement_type, staff_member, notes? }
 * Returns: { engagement, lastEngagedUpdated }
 */
/** The fields every log entry needs, checked the same way for logging and editing. Returns an error message, or the clean fields. */
function readEntryFields(body: Record<string, unknown>):
  { error: string } | { date: string; engagement_type: string; staff_member: string; notes: string } {
  const date = String(body.date || '').trim();
  const engagement_type = String(body.engagement_type || '').trim();
  const staff_member = String(body.staff_member || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) return { error: 'Enter a valid date.' };
  if (date > todayISOET()) return { error: 'The date can\u2019t be in the future.' };
  if (!ENGAGEMENT_TYPES.some((t) => t.name === engagement_type)) return { error: 'Choose an engagement type from the list.' };
  if (!staff_member) return { error: 'Enter your name as the staff member logging this.' };
  return { date, engagement_type, staff_member, notes: String(body.notes || '').trim() };
}

export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const alumni_id = String(body.alumni_id || '').trim();
  if (!alumni_id) return NextResponse.json({ error: 'alumni_id is required' }, { status: 400 });
  const fields = readEntryFields(body);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  try {
    const result = await addAlumniEngagement({ alumni_id, ...fields });
    if ('error' in result) {
      return result.error === 'no_tab'
        ? NextResponse.json({ error: 'No Alumni Engagement Log tab found in the spreadsheet.' }, { status: 409 })
        : NextResponse.json({ error: 'No alum with that ID.' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to log alumni engagement:', err);
    return NextResponse.json({ error: 'Could not save the engagement. Please try again.' }, { status: 500 });
  }
}

/**
 * PATCH /api/alumni-engagement — edit one logged engagement.
 * Body: { id, date: 'YYYY-MM-DD', engagement_type, staff_member, notes? }
 * Returns: { engagement, lastEngaged? } (lastEngaged when the edit changed it)
 */
export async function PATCH(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const fields = readEntryFields(body);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  try {
    const result = await updateAlumniEngagement(id, fields);
    if (!result) return NextResponse.json({ error: 'That entry wasn\u2019t found. Nothing was changed.' }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Failed to edit alumni engagement:', err);
    return NextResponse.json({ error: 'Could not save the changes. Please try again.' }, { status: 500 });
  }
}

/**
 * DELETE /api/alumni-engagement — remove one logged engagement.
 * Body: { id }
 * Returns: { ok, lastEngaged? } (lastEngaged when deleting changed it; '' when cleared)
 */
export async function DELETE(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  try {
    const result = await deleteAlumniEngagement(id);
    if (!result) return NextResponse.json({ error: 'That entry wasn\u2019t found. Nothing was deleted.' }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Failed to delete alumni engagement:', err);
    return NextResponse.json({ error: 'Could not delete the entry. Please try again.' }, { status: 500 });
  }
}
