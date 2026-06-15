import { NextResponse } from 'next/server';
import { fetchFellows } from '@/lib/sheets';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const fellows = await fetchFellows();
    return NextResponse.json(fellows);
  } catch (err) {
    console.error('Failed to fetch fellows:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
