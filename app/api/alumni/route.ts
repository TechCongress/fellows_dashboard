import { isAuthed } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAlumni, createAlumni, updateAlumni } from '@/lib/sheets';

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await fetchAlumni());
  } catch (err) {
    console.error('Failed to fetch alumni:', err);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    if (body.id) {
      const ok = await updateAlumni(body.id, body);
      if (!ok) return NextResponse.json({ error: 'No alum with that ID. Nothing was saved.' }, { status: 404 });
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ ok: await createAlumni(body) });
  } catch (err) {
    console.error('Failed to save alum:', err);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
