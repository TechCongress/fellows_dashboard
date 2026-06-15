import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAlumni, createAlumni, updateAlumni } from '@/lib/sheets';

function authed() {
  const store = cookies();
  return store.get('tc-auth')?.value === 'authenticated';
}

export async function GET() {
  if (!authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const alumni = await fetchAlumni();
  return NextResponse.json(alumni);
}

export async function POST(req: NextRequest) {
  if (!authed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (body.id) {
    // Update existing
    const ok = await updateAlumni(body.id, body);
    return NextResponse.json({ ok });
  } else {
    // Create new
    const ok = await createAlumni(body);
    return NextResponse.json({ ok });
  }
}
