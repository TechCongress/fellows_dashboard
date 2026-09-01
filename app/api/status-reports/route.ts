import { NextRequest, NextResponse } from 'next/server';
import { fetchStatusReports, logStatusReport, deleteStatusReport } from '@/lib/sheets';
import { getRequiredReportMonths, calculateStreak } from '@/lib/helpers';
import { cookies } from 'next/headers';
import { Resend } from 'resend';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

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
    const { fellow_id, fellow_name, month, late, date_submitted, notes, report_start_date, report_end_month } = body;
    if (!fellow_id || !fellow_name || !month || !date_submitted) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await logStatusReport({ fellow_id, fellow_name, month, late: !!late, date_submitted, notes });

    // ── Streak milestone check ─────────────────────────────────────────────
    // Only check if this was an on-time submission and report dates are available
    if (!late && report_start_date && process.env.RESEND_API_KEY) {
      try {
        const reports = await fetchStatusReports(fellow_id);
        const fakeFellow = { report_start_date, report_end_month, requires_monthly_reports: true } as any;
        const requiredMonths = getRequiredReportMonths(fakeFellow);
        const { streak } = calculateStreak(reports, requiredMonths);

        if (streak > 0 && streak % 3 === 0) {
          const giftCards = streak / 3;
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'TechCongress Dashboard <onboarding@resend.dev>',
            to: 'hello@techcongress.io',
            subject: `🎁 ${fellow_name} has earned a gift card!`,
            html: `
              <p>Hi Mya,</p>
              <p><strong>${fellow_name}</strong> just submitted their <strong>${month}</strong> status report on time, completing <strong>${streak} consecutive on-time submissions</strong>.</p>
              <p>They have now earned <strong>${giftCards} gift card${giftCards > 1 ? 's' : ''}</strong> total ($${giftCards * 50} in restaurant gift cards).</p>
              <p>— TechCongress Dashboard</p>
            `,
          });
        }
      } catch (emailErr) {
        // Email failure should not fail the whole request
        console.error('[streak-email]', emailErr);
      }
    }

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
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
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
