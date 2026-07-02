import { NextRequest, NextResponse } from 'next/server';
import { updateFellowOffboarding } from '@/lib/sheets';
import { cookies } from 'next/headers';

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, offboarding_completed } = await req.json();
    const ok = await updateFellowOffboarding(id, offboarding_completed);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to update offboarding:', err);
    return NextResponse.json({ error: 'Failed to update offboarding' }, { status: 500 });
  }
}
