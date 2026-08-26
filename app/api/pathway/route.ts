import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchPathwayRecords,
  savePathwayRecord,
  fetchCareerHistory,
  fetchFellows,
  fetchAlumni,
} from '@/lib/sheets';
import {
  MAX_POLICY_AREAS,
  MAX_TARGET_PATHWAYS,
  POLICY_AREAS,
  PATHWAY_NAMES,
  normalizePathway,
} from '@/lib/career-pathway';
import { deriveAlumniPathways, derivationExplanation } from '@/lib/pathway-derivation';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

/**
 * Google's spreadsheet quota is 60 reads a minute per person, and it resets on
 * its own. The client retries a 429 a few times before it ever reaches here, so
 * if one still surfaces, the answer really is "wait" — say that, rather than
 * showing a generic failure the person can only answer by clicking Save again.
 */
function isRateLimit(err: unknown): boolean {
  const status = (err as { code?: number; status?: number })?.code
    ?? (err as { code?: number; status?: number })?.status;
  return status === 429;
}

const RATE_LIMIT_MESSAGE =
  'Google is rate-limiting the spreadsheet right now. Nothing was saved — wait about a minute and try again.';

/**
 * GET /api/pathway            — setup status plus every tagging record
 * GET /api/pathway?id=a1      — one person, including their derived pathway
 */
export async function GET(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');

  try {
    const pathways = await fetchPathwayRecords();
    const setup = {
      pathwayTab: pathways.available,
      missingColumns: pathways.missingColumns,
      sheetName: pathways.sheetName,
    };

    if (!id) {
      return NextResponse.json({ setup, records: pathways.records });
    }

    const record = pathways.records[id] || null;
    const history = await fetchCareerHistory(id);

    // Derivation is for alumni only: a current fellow's Current role IS the
    // fellowship, which would derive "Stay in Congress" for everyone placed in
    // a Senate office.
    const isAlumni = (record?.record_type || '').toLowerCase().includes('alum');
    const alum = isAlumni ? (await fetchAlumni()).find((a) => a.id === id) : undefined;
    const derived = isAlumni
      ? deriveAlumniPathways(
          history.entries,
          record?.pathway_override,
          alum ? { current_role: alum.current_role, sector: alum.sector } : undefined
        )
      : null;

    return NextResponse.json({
      setup,
      record,
      careerHistoryAvailable: history.available,
      derivation: derived && {
        pathways: derived.pathways,
        priorPathways: derived.priorPathways,
        overridden: derived.overridden,
        explanation: derived.current[0] ? derivationExplanation(derived.current[0]) : '',
        wouldHaveBeen: derived.wouldHaveBeen
          ? { pathway: derived.wouldHaveBeen.pathway, why: derivationExplanation(derived.wouldHaveBeen) }
          : null,
        prior: derived.prior.map((p) => ({
          pathway: p.pathway,
          title: p.role?.title || '',
          org: p.role?.org || '',
        })),
      },
    });
  } catch (err) {
    console.error('Failed to read pathway data:', err);
    if (isRateLimit(err)) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    return NextResponse.json({ error: 'Failed to read pathway data' }, { status: 500 });
  }
}

/**
 * PATCH /api/pathway
 * Body: { id, policy_areas?, target_pathways?, pathway_override?, notes? }
 *
 * Writes to the Career Pathways Engine tab, creating the person's row if they
 * don't have one. Only the fields supplied are written, so a partial save can't
 * blank a column it wasn't asked to touch.
 */
export async function PATCH(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Clamp to the fixed taxonomies here, so nothing off-list can reach the
    // sheet even though the sheet's own dropdowns aren't set by the code.
    const patch: Record<string, unknown> = {};
    if (body.policy_areas !== undefined) {
      patch.policy_areas = (body.policy_areas || [])
        .filter((t: string) => POLICY_AREAS.includes(t))
        .slice(0, MAX_POLICY_AREAS);
    }
    if (body.target_pathways !== undefined) {
      patch.target_pathways = (body.target_pathways || [])
        // Migrate a renamed label before validating — otherwise an old value
        // fails the taxonomy check and gets silently dropped instead of fixed.
        .map(normalizePathway)
        .filter((t: string) => PATHWAY_NAMES.includes(t))
        .slice(0, MAX_TARGET_PATHWAYS);
    }
    if (body.pathway_override !== undefined) {
      const override = normalizePathway(body.pathway_override || '');
      patch.pathway_override = PATHWAY_NAMES.includes(override) ? override : '';
    }
    if (body.notes !== undefined) {
      // Free text — no taxonomy to clamp to. Bounded only so a runaway paste
      // can't push the row past what a Sheets cell will hold (50k characters).
      patch.notes = String(body.notes || '').slice(0, 5000);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // Identity columns for a row that has to be created. The Fellows and Alumni
    // tabs stay the source of truth for name, cohort, and which they are.
    //
    // Passed as a function rather than a value: most saves update a row that
    // already exists, and reading both tabs to fill columns that are already
    // populated is what pushed this route over Google's per-minute read quota.
    // Now those two reads only happen on the save that creates the row.
    const result = await savePathwayRecord(id, patch, async () => {
      const [fellows, alumni] = await Promise.all([fetchFellows(), fetchAlumni()]);
      const fellow = fellows.find((f) => f.id === id);
      if (fellow) return { name: fellow.name, record_type: 'Current Fellow', cohort: fellow.cohort };
      const alum = alumni.find((a) => a.id === id);
      if (alum) return { name: alum.name, record_type: 'Alumni', cohort: alum.cohort };
      return undefined;
    });

    if (!result.available) {
      return NextResponse.json(
        { error: 'The "Career Pathways Engine" tab was not found in the spreadsheet.', available: false },
        { status: 409 }
      );
    }
    if (result.missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Missing column(s) on the Career Pathways Engine tab: ${result.missingColumns.join(', ')}`,
          missingColumns: result.missingColumns,
        },
        { status: 409 }
      );
    }

    const refreshed = await fetchPathwayRecords();
    return NextResponse.json({
      ok: true,
      created: result.created,
      last_updated: result.last_updated,
      record: refreshed.records[id] || null,
    });
  } catch (err) {
    console.error('Failed to save pathway tags:', err);
    if (isRateLimit(err)) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    return NextResponse.json({ error: 'Failed to save pathway tags' }, { status: 500 });
  }
}
