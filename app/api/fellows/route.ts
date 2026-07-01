import { NextRequest, NextResponse } from 'next/server';
import { fetchFellows, createFellow, updateFellow, deleteFellow } from '@/lib/sheets';
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

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const ok = await createFellow(body);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to create fellow:', err);
    return NextResponse.json({ error: 'Failed to create fellow' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, ...data } = await req.json();
    const ok = await updateFellow(id, data);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to update fellow:', err);
    return NextResponse.json({ error: 'Failed to update fellow' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = cookieStore.get('tc-auth');
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await req.json();
    const ok = await deleteFellow(id);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error('Failed to delete fellow:', err);
    return NextResponse.json({ error: 'Failed to delete fellow' }, { status: 500 });
  }
}
