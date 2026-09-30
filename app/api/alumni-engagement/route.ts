import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAlumniEngagements, addAlumniEngagement } from '@/lib/sheets';
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
export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const alumni_id = String(body.alumni_id || '').trim();
  const date = String(body.date || '').trim();
  const engagement_type = String(body.engagement_type || '').trim();
  const staff_member = String(body.staff_member || '').trim();
  if (!alumni_id) return NextResponse.json({ error: 'alumni_id is required' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
  }
  if (date > todayISOET()) return NextResponse.json({ error: 'The date can’t be in the future.' }, { status: 400 });
  if (!ENGAGEMENT_TYPES.some((t) => t.name === engagement_type)) {
    return NextResponse.json({ error: 'Choose an engagement type from the list.' }, { status: 400 });
  }
  if (!staff_member) return NextResponse.json({ error: 'Enter your name as the staff member logging this.' }, { status: 400 });
  try {
    const result = await addAlumniEngagement({ alumni_id, date, engagement_type, staff_member, notes: String(body.notes || '').trim() });
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
