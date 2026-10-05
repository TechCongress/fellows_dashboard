import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchStatusReports, logStatusReport, deleteStatusReport } from '@/lib/sheets';

const authed = isAuthed;

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const fellowId = req.nextUrl.searchParams.get('fellowId') || undefined;
  try {
    const reports = await fetchStatusReports(fellowId);
    return NextResponse.json(reports);
  } catch (err) {
    console.error('Failed to fetch status reports:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { fellow_id, fellow_name, month, late, date_submitted, notes } = body;
    if (!fellow_id || !fellow_name || !month || !date_submitted) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await logStatusReport({ fellow_id, fellow_name, month, late: !!late, date_submitted, notes });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to log status report:', err);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }
}

/**
 * DELETE /api/status-reports
 * Body: { fellow_id, month }
 *
 * Removes one logged report. The sync files a submission under the month it
 * arrived in, so a late report for a previous month lands under the wrong one —
 * re-logging can correct a month, but only removal clears a month that should
 * never have been recorded.
 */
export async function DELETE(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { fellow_id, month } = await req.json();
    if (!fellow_id || !month) {
      return NextResponse.json({ error: 'fellow_id and month are required' }, { status: 400 });
    }
    const removed = await deleteStatusReport(fellow_id, month);
    if (!removed) {
      return NextResponse.json(
        { error: 'No logged report found for that month — nothing was removed.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to remove status report:', err);
    return NextResponse.json({ error: 'Failed to remove the report. Please try again.' }, { status: 500 });
  }
}
