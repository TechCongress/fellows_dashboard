import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCareerHistory, saveCareerHistory } from '@/lib/sheets';
import { phaseDateViolation } from '@/lib/career-pathway';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

/**
 * GET /api/career-history?personId=...
 * Returns { available, entries, missingColumns }. `available: false` means the
 * "Alumni Career History" tab isn't in the spreadsheet yet — the UI shows a
 * setup note instead of an error.
 */
export async function GET(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const personId = req.nextUrl.searchParams.get('personId') || undefined;
  try {
    const result = await fetchCareerHistory(personId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to fetch career history:', err);
    return NextResponse.json({ error: 'Failed to fetch career history' }, { status: 500 });
  }
}

/**
 * POST /api/career-history
 * Body: { personId, personName, cohort, entries: CareerHistoryEntry[] }
 * Replaces that one person's rows. Rows re-sort by start date and Order is
 * recomputed server-side — clients never send an Order value.
 *
 * `cohort` is used only to re-run phaseDateViolation server-side — the same
 * check the editor already blocks Save on — so a role tagged on the wrong
 * side of the fellowship can't slip in through a direct API call either.
 */
export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { personId, personName, cohort, entries } = await req.json();
    if (!personId) return NextResponse.json({ error: 'personId is required' }, { status: 400 });
    if (!Array.isArray(entries)) return NextResponse.json({ error: 'entries must be an array' }, { status: 400 });

    const violation = entries
      .map((e) => phaseDateViolation(e?.phase, e?.start, cohort || ''))
      .find((v) => v);
    if (violation) return NextResponse.json({ error: violation }, { status: 400 });

    const result = await saveCareerHistory(personId, personName || '', entries);
    if (!result.available) {
      return NextResponse.json(
        { error: 'The "Alumni Career History" tab was not found in the spreadsheet.', available: false },
        { status: 409 }
      );
    }
    const refreshed = await fetchCareerHistory(personId);
    return NextResponse.json({ ok: true, ...refreshed });
  } catch (err) {
    console.error('Failed to save career history:', err);
    return NextResponse.json({ error: 'Failed to save career history' }, { status: 500 });
  }
}
