import { NextResponse } from 'next/server';
import { resumenSemanal } from '@/lib/claude';
import { isAuthorizedCron } from '@/lib/cron';
import { dayTitle, lastDays, longDate } from '@/lib/dates';
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
  const dias = lastDays(7, now);
  const secciones: string[] = [];

  for (const dia of dias) {
    const titulo = dayTitle(dia);
    const pageId = await findDayPage(titulo);
    if (!pageId) continue;

    const contenido = await readPageText(pageId);
    if (contenido.trim()) {
      secciones.push(`## ${longDate(dia)}\n${contenido}`);
    }
  }

  if (secciones.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'semana sin entradas' });
  }

  const rango = `${longDate(dias[0])} — ${longDate(dias[dias.length - 1])}`;
  const resumen = await resumenSemanal(secciones.join('\n\n'), rango);
  await sendEmail(`Journal · semana del ${longDate(dias[0])}`, resumen);

  return NextResponse.json({ ok: true, sent: true, dias: secciones.length });
}
