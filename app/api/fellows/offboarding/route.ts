import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { parseChecklist, serializeChecklist } from '@/lib/helpers';
import { updateFellowOffboarding } from '@/lib/sheets';

export async function PATCH(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, offboarding_completed } = await req.json();
    // Saved as task ids in checklist order; old position lists are converted.
    const ok = await updateFellowOffboarding(id, serializeChecklist(parseChecklist(String(offboarding_completed ?? ''), 'offboarding'), 'offboarding'));
    if (!ok) {
      return NextResponse.json(
        { error: 'Not saved: fellow not found, or the offboarding column is missing from the Fellows tab.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to update offboarding:', err);
    return NextResponse.json({ error: 'Failed to update offboarding' }, { status: 500 });
  }
}
