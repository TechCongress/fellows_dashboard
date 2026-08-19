import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchFellows, fetchAlumni, pathwaySetupStatus } from '@/lib/sheets';
import { rankAlumni } from '@/lib/career-pathway';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

/**
 * GET /api/fellows/[id]/pathway?limit=4
 *
 * Reads the Fellows and Alumni tabs, scores every alum against this fellow in
 * memory, and returns the ranked list. On-demand rather than a batch job —
 * at TechCongress's scale (dozens of fellows, a modest alumni pool) there's
 * nothing to gain from precomputing, and nothing to go stale.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '4', 10) || 4;

  try {
    const [fellows, alumni, setup] = await Promise.all([
      fetchFellows(),
      fetchAlumni(),
      pathwaySetupStatus(),
    ]);
    const fellow = fellows.find((f) => f.id === id);
    if (!fellow) return NextResponse.json({ error: 'Fellow not found' }, { status: 404 });

    const matches = rankAlumni(fellow.policy_areas, fellow.target_pathways, alumni, limit);

    return NextResponse.json({
      fellow_id: fellow.id,
      policy_areas: fellow.policy_areas,
      target_pathways: fellow.target_pathways,
      tagged: fellow.policy_areas.length > 0 || fellow.target_pathways.length > 0,
      // How many alumni are actually taggable — matching quality is bounded by
      // this, so the UI can explain a thin result set honestly.
      alumni_total: alumni.length,
      alumni_tagged: alumni.filter((a) => a.policy_areas.length > 0 || a.realized_pathway).length,
      alumni_do_not_contact: alumni.filter((a) => a.contact === false).length,
      setup,
      matches,
    });
  } catch (err) {
    console.error('Failed to compute pathway matches:', err);
    return NextResponse.json({ error: 'Failed to compute matches' }, { status: 500 });
  }
}
