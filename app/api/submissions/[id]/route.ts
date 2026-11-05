import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

async function readSubmissions() {
  try {
    const raw = await fs.readFile(SUBMISSIONS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeSubmissions(submissions: any[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), 'utf-8');
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const submissions = await readSubmissions();
    const filtered = submissions.filter((s) => s.id !== params.id);
    await writeSubmissions(filtered);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const submissions = await readSubmissions();
    const index = submissions.findIndex((s) => s.id === params.id);
    if (index === -1) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy bài nộp' }, { status: 404 });
    }
    submissions[index] = { ...submissions[index], ...body };
    await writeSubmissions(submissions);
    return NextResponse.json({ success: true, data: submissions[index] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
