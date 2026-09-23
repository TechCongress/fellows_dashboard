import { NextRequest, NextResponse } from 'next/server';
import { fetchCheckins, addCheckin } from '@/lib/sheets';
import { CHECKIN_TYPES } from '@/lib/helpers';
import { cookies } from 'next/headers';

async function authed() {
  const cookieStore = await cookies();
  return cookieStore.get('tc-auth')?.value === 'authenticated';
}

export async function GET(req: NextRequest) {
  if (!(await authed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fellowId = req.nextUrl.searchParams.get('fellowId') || undefined;
  try {
    const checkins = await fetchCheckins(fellowId);
    return NextResponse.json(checkins);
  } catch (err) {
    console.error('Failed to fetch checkins:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

/**
 * POST /api/checkins — log a check-in.
 * Body: { fellow_id, date: 'YYYY-MM-DD', check_in_type, notes?, staff_member? }
 * Returns: { checkin, lastCheckInUpdated }
 */
export async function POST(req: NextRequest) {
  if (!(await authed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const fellow_id = String(body.fellow_id || '').trim();
  const date = String(body.date || '').trim();
  const check_in_type = String(body.check_in_type || '').trim();
  if (!fellow_id) return NextResponse.json({ error: 'fellow_id is required' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
    return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
  }
  if (!CHECKIN_TYPES.includes(check_in_type)) {
    return NextResponse.json({ error: `Choose a check-in type: ${CHECKIN_TYPES.join(', ')}.` }, { status: 400 });
  }
  try {
    const result = await addCheckin({
      fellow_id,
      date,
      check_in_type,
      notes: String(body.notes || '').trim(),
      staff_member: String(body.staff_member || '').trim(),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to log checkin:', err);
    return NextResponse.json({ error: 'Could not save the check-in. Please try again.' }, { status: 500 });
  }
}
