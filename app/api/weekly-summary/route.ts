/**
 * Resumen semanal. Lo dispara Vercel Cron los domingos (20:00 Europe/Madrid).
 * Cubre los 7 días que terminan hoy.
 */

import { NextResponse } from "next/server";

import { weeklySummary } from "@/lib/claude";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { findDayPage, readPageText } from "@/lib/notion";
import { humanDate, journalTitleFromDate, lastSevenDays, localDate } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const override = new URL(request.url).searchParams.get("date");
  const end = override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : localDate();
  const dates = lastSevenDays(end);

  try {
    const days: { label: string; text: string }[] = [];

    for (const date of dates) {
      const title = journalTitleFromDate(date);
      const pageId = await findDayPage(title);
      const text = pageId ? await readPageText(pageId) : "";
      days.push({ label: `${title} (${humanDate(date)})`, text });
    }

    const withContent = days.filter((day) => day.text.trim().length > 0);
    if (withContent.length === 0) {
      return NextResponse.json({ ok: true, skipped: "sin entradas esta semana" });
    }

    const rangeLabel = `${journalTitleFromDate(dates[0])} al ${journalTitleFromDate(end)}`;
    const summary = await weeklySummary(rangeLabel, days);
    await sendEmail(`Journal · semana ${rangeLabel}`, summary);

    return NextResponse.json({ ok: true, range: rangeLabel, days: withContent.length });
  } catch (error) {
    console.error("[weekly-summary] falló", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
