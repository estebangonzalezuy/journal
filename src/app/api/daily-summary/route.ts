import { NextResponse } from 'next/server';
import { resumenDiario } from '@/lib/claude';
import { isAuthorizedCron } from '@/lib/cron';
import { dayTitle, longDate } from '@/lib/dates';
import { sendEmail } from '@/lib/email';
import { findDayPage, readPageText } from '@/lib/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const titulo = dayTitle(now);
  const pageId = await findDayPage(titulo);

  if (!pageId) {
    return NextResponse.json({ ok: true, skipped: 'sin página del día' });
  }

  const contenido = await readPageText(pageId);
  if (!contenido.trim()) {
    return NextResponse.json({ ok: true, skipped: 'página vacía' });
  }

  const resumen = await resumenDiario(contenido, longDate(now));
  await sendEmail(`Journal · ${longDate(now)}`, resumen);

  return NextResponse.json({ ok: true, sent: true });
}
