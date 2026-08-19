import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  pathwaySetupStatus,
  updateFellowPathway,
  updateAlumniPathway,
} from '@/lib/sheets';
import { MAX_POLICY_AREAS, MAX_TARGET_PATHWAYS, POLICY_AREAS, PATHWAY_NAMES } from '@/lib/career-pathway';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

/** GET /api/pathway — which Career Pathway columns/tabs exist in the sheet. */
export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await pathwaySetupStatus());
  } catch (err) {
    console.error('Failed to read pathway setup status:', err);
    return NextResponse.json({ error: 'Failed to read setup status' }, { status: 500 });
  }
}

/**
 * PATCH /api/pathway
 * Body: { type: 'fellow', id, policy_areas[], target_pathways[] }
 *    or { type: 'alumni', id, policy_areas[], realized_pathway }
 *
 * Writes only the pathway cells, leaving the rest of the row alone. If the
 * column hasn't been added to the sheet yet, responds 409 naming exactly which
 * header to add rather than failing silently.
 */
export async function PATCH(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { type, id } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Only accept tags from the fixed taxonomies, and enforce the caps here so
    // a bad client can't write junk into the sheet.
    const policyAreas: string[] = (body.policy_areas || [])
      .filter((t: string) => POLICY_AREAS.includes(t))
      .slice(0, MAX_POLICY_AREAS);

    if (type === 'fellow') {
      const targets: string[] = (body.target_pathways || [])
        .filter((t: string) => PATHWAY_NAMES.includes(t))
        .slice(0, MAX_TARGET_PATHWAYS);
      const result = await updateFellowPathway(id, policyAreas, targets);
      if (result.missingColumns.length > 0) {
        return NextResponse.json(
          { error: `Missing column(s) on the Fellows tab: ${result.missingColumns.join(', ')}`, missingColumns: result.missingColumns },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: result.ok, policy_areas: policyAreas, target_pathways: targets });
    }

    if (type === 'alumni') {
      const realized: string = PATHWAY_NAMES.includes(body.realized_pathway) ? body.realized_pathway : '';
      const result = await updateAlumniPathway(id, policyAreas, realized);
      if (result.missingColumns.length > 0) {
        return NextResponse.json(
          { error: `Missing column(s) on the Alumni tab: ${result.missingColumns.join(', ')}`, missingColumns: result.missingColumns },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: result.ok, policy_areas: policyAreas, realized_pathway: realized });
    }

    return NextResponse.json({ error: "type must be 'fellow' or 'alumni'" }, { status: 400 });
  } catch (err) {
    console.error('Failed to save pathway tags:', err);
    return NextResponse.json({ error: 'Failed to save pathway tags' }, { status: 500 });
  }
}
