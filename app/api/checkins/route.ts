import { NextRequest, NextResponse } from 'next/server';
import { fetchCheckins } from '@/lib/sheets';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fellowId = req.nextUrl.searchParams.get('fellowId') || undefined;
  try {
    const checkins = await fetchCheckins(fellowId);
    return NextResponse.json(checkins);
  } catch (err) {
    console.error('Failed to fetch checkins:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
