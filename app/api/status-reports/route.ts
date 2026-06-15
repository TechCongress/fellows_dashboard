import { NextRequest, NextResponse } from 'next/server';
import { fetchStatusReports } from '@/lib/sheets';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fellowId = req.nextUrl.searchParams.get('fellowId') || undefined;
  try {
    const reports = await fetchStatusReports(fellowId);
    return NextResponse.json(reports);
  } catch (err) {
    console.error('Failed to fetch status reports:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
