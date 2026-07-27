/**
 * Resumen diario. Lo dispara Vercel Cron una vez por día (21:00 Europe/Madrid,
 * con la imprecisión de ±59 min del plan Hobby).
 */

import { NextResponse } from "next/server";

import { dailySummary } from "@/lib/claude";
import { isAuthorizedCron } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { findDayPage, readPageText } from "@/lib/notion";
import { humanDate, journalTitleFromDate, localDate } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `?date=YYYY-MM-DD` permite regenerar el resumen de un día pasado.
  const override = new URL(request.url).searchParams.get("date");
  const date = override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : localDate();
  const title = journalTitleFromDate(date);

  try {
    const pageId = await findDayPage(title);
    if (!pageId) {
      return NextResponse.json({ ok: true, skipped: `sin página ${title}` });
    }

    const journalText = await readPageText(pageId);
    if (journalText.trim().length < 20) {
      return NextResponse.json({ ok: true, skipped: `página ${title} vacía` });
    }

    const summary = await dailySummary(humanDate(date), journalText);
    await sendEmail(`Journal · ${title}`, summary);

    return NextResponse.json({ ok: true, date, title });
  } catch (error) {
    console.error("[daily-summary] falló", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
