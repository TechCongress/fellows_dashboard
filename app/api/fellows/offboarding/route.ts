import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { updateFellowOffboarding } from '@/lib/sheets';

export async function PATCH(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, offboarding_completed } = await req.json();
    const ok = await updateFellowOffboarding(id, offboarding_completed);
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
