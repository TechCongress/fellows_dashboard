import { NextRequest, NextResponse } from 'next/server';
import { updateFellowOnboarding } from '@/lib/sheets';
import { cookies } from 'next/headers';

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, onboarding_completed } = await req.json();
    const ok = await updateFellowOnboarding(id, onboarding_completed);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to update onboarding:', err);
    return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 });
  }
}
