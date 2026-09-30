import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { updateFellowOnboarding } from '@/lib/sheets';

export async function PATCH(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, onboarding_completed } = await req.json();
    const ok = await updateFellowOnboarding(id, onboarding_completed);
    if (!ok) {
      return NextResponse.json(
        { error: 'Not saved: fellow not found, or the onboarding column is missing from the Fellows tab.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to update onboarding:', err);
    return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 });
  }
}
