import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchFellows, fetchAlumni, createAlumni, deleteFellow } from '@/lib/sheets';

async function authed() {
  const store = await cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

/**
 * POST /api/fellows/move-to-alumni
 * Body: { id, current_role, sector, location }
 *
 * Moves a fellow to the Alumni tab, keeping their ID.
 *
 * This used to be two fetches from the browser — POST /api/alumni, then
 * DELETE /api/fellows — which had two problems. The create minted a fresh ID,
 * stranding the person's career history, pathway tagging, check-ins and status
 * reports under an ID whose Fellows row was about to be deleted. And nothing
 * handled a failure between the two calls, so a successful create followed by a
 * failed delete left the person on both tabs with no indication anything had
 * gone wrong.
 *
 * Doing it in one request fixes both: the ID carries over, and the caller gets
 * a single answer describing exactly how far it got.
 *
 * Order is deliberate. Create first: if it fails, nothing has changed and the
 * fellow is untouched. Deleting first would risk losing the record outright.
 */
export async function POST(req: NextRequest) {
  if (!(await authed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const id = (body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const [fellows, alumni] = await Promise.all([fetchFellows(), fetchAlumni()]);
    const fellow = fellows.find((f) => f.id === id);

    // Already on the Alumni tab. Can happen if a previous attempt created the
    // row and then failed to delete the fellow — retrying should finish the job
    // rather than add a second alumni row for the same person.
    const alreadyAlumni = alumni.some((a) => a.id === id);

    if (!fellow && !alreadyAlumni) {
      return NextResponse.json({ error: 'No fellow with that ID' }, { status: 404 });
    }

    if (!alreadyAlumni) {
      if (!fellow) return NextResponse.json({ error: 'No fellow with that ID' }, { status: 404 });
      const created = await createAlumni(
        {
          name: fellow.name,
          email: fellow.email,
          phone: fellow.phone,
          linkedin: fellow.linkedin,
          cohort: fellow.cohort,
          fellow_types: fellow.fellow_type ? [fellow.fellow_type] : [],
          office_served: fellow.office,
          chamber: fellow.chamber,
          party: fellow.party,
          education: fellow.education,
          prior_role: fellow.prior_role,
          notes: fellow.notes,
          current_role: body.current_role || '',
          sector: body.sector || '',
          location: body.location || '',
          contact: true,
          served_on_hill: true,
          currently_on_hill: false,
        },
        id // ← the whole point: same person, same ID
      );
      if (!created) {
        return NextResponse.json(
          { error: 'Could not create the alumni record. Nothing was changed.' },
          { status: 500 }
        );
      }
    }

    // The alumni row now exists either way. If this fails, say so plainly —
    // the person is on both tabs and someone has to remove the Fellows row.
    const removed = fellow ? await deleteFellow(id) : true;
    if (!removed) {
      return NextResponse.json(
        {
          ok: false,
          created: true,
          removed: false,
          error:
            'Added to Alumni, but their Fellows row could not be removed — they are currently on both tabs. Try again, or delete the Fellows row by hand.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id, created: !alreadyAlumni, removed: true });
  } catch (err) {
    console.error('Failed to move fellow to alumni:', err);
    return NextResponse.json(
      { error: 'Failed to move to alumni. Check the Fellows and Alumni tabs before retrying.' },
      { status: 500 }
    );
  }
}
