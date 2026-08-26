import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchFellows, fetchAlumni, fetchPathwayRecords, fetchCareerHistory } from '@/lib/sheets';
import { rankAlumni, dateRangeLabel } from '@/lib/career-pathway';
import { deriveAlumniPathways, derivationExplanation } from '@/lib/pathway-derivation';
import { CareerHistoryEntry } from '@/types';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

/**
 * GET /api/fellows/[id]/pathway?limit=4
 *
 * Reads tagging from the Career Pathways Engine tab, derives each alum's
 * pathway from their career history, scores everyone in memory, and returns the
 * ranked list. On-demand rather than batched — at this scale there's nothing to
 * gain from precomputing and nothing to go stale.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '4', 10) || 4;

  try {
    const [fellows, alumni, pathways, history] = await Promise.all([
      fetchFellows(),
      fetchAlumni(),
      fetchPathwayRecords(),
      fetchCareerHistory(),
    ]);

    const fellow = fellows.find((f) => f.id === id);
    if (!fellow) return NextResponse.json({ error: 'Fellow not found' }, { status: 404 });

    // Career history grouped by person, so each alum is derived once.
    const historyByPerson: Record<string, CareerHistoryEntry[]> = {};
    for (const entry of history.entries) {
      (historyByPerson[entry.person_id] ||= []).push(entry);
    }

    const alumniById = new Map(alumni.map((a) => [a.id, a]));
    const derived = new Map<string, ReturnType<typeof deriveAlumniPathways>>();
    const resolve = (alumId: string) => {
      if (!derived.has(alumId)) {
        const a = alumniById.get(alumId);
        derived.set(
          alumId,
          deriveAlumniPathways(
            historyByPerson[alumId] || [],
            pathways.records[alumId]?.pathway_override,
            // Last resort for alumni whose career history isn't backfilled yet.
            a ? { current_role: a.current_role, sector: a.sector } : undefined
          )
        );
      }
      return derived.get(alumId)!;
    };

    const record = pathways.records[fellow.id];
    const policyAreas = record?.policy_areas || [];
    const targetPathways = record?.target_pathways || [];

    const matches = rankAlumni(policyAreas, targetPathways, alumni, limit, (a) => {
      const d = resolve(a.id);
      return { pathways: d.pathways, priorPathways: d.priorPathways };
    }).map((m) => {
      const d = resolve(m.alumni.id);
      return {
        ...m,
        provenance: d.current[0] ? derivationExplanation(d.current[0]) : '',
        overridden: d.overridden,
        // Only the past roles that actually earned the +1 are worth naming —
        // listing every former job would bury the reason under noise.
        priorRoles: m.priorMatch
          ? d.prior
              .filter((p) => targetPathways.includes(p.pathway))
              .map((p) => ({
                title: p.role?.title || '',
                org: p.role?.org || '',
                pathway: p.pathway,
                range: '',
              }))
          : [],
      };
    });

    // Attach date ranges to the named prior roles, from the history rows.
    for (const m of matches) {
      for (const pr of m.priorRoles || []) {
        const row = (historyByPerson[m.alumni.id] || []).find(
          (h) => h.title === pr.title && h.org === pr.org
        );
        if (row) pr.range = dateRangeLabel(row.start, row.end);
      }
    }

    const taggedAlumni = alumni.filter((a) => (pathways.records[a.id]?.policy_areas?.length || 0) > 0);

    return NextResponse.json({
      fellow_id: fellow.id,
      policy_areas: policyAreas,
      target_pathways: targetPathways,
      tagged: policyAreas.length > 0 || targetPathways.length > 0,
      last_updated: record?.last_updated || '',
      over_cap: record?.over_cap || [],
      alumni_total: alumni.length,
      alumni_tagged: taggedAlumni.length,
      alumni_with_history: Object.keys(historyByPerson).length,
      setup: {
        pathwayTab: pathways.available,
        careerHistoryTab: history.available,
        missingColumns: pathways.missingColumns,
        sheetName: pathways.sheetName,
      },
      matches,
    });
  } catch (err) {
    console.error('Failed to compute pathway matches:', err);
    return NextResponse.json({ error: 'Failed to compute matches' }, { status: 500 });
  }
}
