/**
 * Webhook de Telegram. Captura en tiempo real: audio o texto entra, entrada de
 * journal en Notion sale, y si hay tareas puntuales las propone para confirmar.
 */

import { NextResponse } from "next/server";

import { processEntry } from "@/lib/claude";
import { optional, required } from "@/lib/env";
import { appendJournalEntry, createTask, findOrCreateDayPage } from "@/lib/notion";
import { parseProposal, renderProposal } from "@/lib/proposals";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  escapeHtml,
  sendChatAction,
  sendMessage,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";
import { transcribe } from "@/lib/transcribe";
import { humanDateTime, journalTitle, localTime, localToIso } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deduplicación best-effort de reintentos de Telegram mientras la lambda sigue
 * caliente. No es garantía: si Vercel arranca una instancia nueva se pierde.
 * Es suficiente para el caso real (un reintento inmediato tras un timeout).
 */
const seenUpdates = new Set<number>();

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = optional("TELEGRAM_WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = request.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (typeof update.update_id === "number") {
    if (seenUpdates.has(update.update_id)) {
      return NextResponse.json({ ok: true, skipped: "duplicate" });
    }
    seenUpdates.add(update.update_id);
    if (seenUpdates.size > 500) {
      // Mantener el set acotado; el orden de inserción hace de FIFO.
      for (const id of seenUpdates) {
        seenUpdates.delete(id);
        if (seenUpdates.size <= 250) break;
      }
    }
  }

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error("[journal] fallo procesando update", error);
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId && isAllowedChat(chatId)) {
      await safeSend(chatId, `⚠️ Algo falló: ${escapeHtml(describe(error))}`);
    }
  }

  // Siempre 200: un error de nuestro lado no debe hacer que Telegram reintente
  // el mismo mensaje en loop.
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------

function isAllowedChat(chatId: number): boolean {
  const allowed = optional("TELEGRAM_CHAT_ID");
  if (!allowed) return true;
  return allowed
    .split(",")
    .map((id) => id.trim())
    .includes(String(chatId));
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;

  if (!isAllowedChat(chatId)) {
    console.warn(`[journal] chat no autorizado: ${chatId}`);
    return;
  }

  const text = (message.text ?? message.caption ?? "").trim();

  if (text.startsWith("/")) {
    await handleCommand(chatId, text);
    return;
  }

  await sendChatAction(chatId);

  // 1. Conseguir el texto crudo: escrito o transcrito.
  let raw: string;
  const audio = message.voice ?? message.audio ?? message.video_note ?? audioDocument(message);

  if (audio) {
    const { blob, name } = await downloadFile(audio.file_id);
    raw = await transcribe(blob, name);
    await sendChatAction(chatId);
  } else if (text) {
    raw = text;
  } else {
    await sendMessage(chatId, "No encontré ni texto ni audio en ese mensaje.");
    return;
  }

  // 2. Claude redacta la entrada y detecta tareas puntuales.
  const { journal_entry, tasks } = await processEntry(raw);

  // 3. Escribir en la página del día (creándola si hace falta).
  const title = journalTitle();
  const pageId = await findOrCreateDayPage(title);
  await appendJournalEntry(pageId, localTime(), journal_entry || raw);

  const preview =
    journal_entry.length > 500 ? `${journal_entry.slice(0, 500)}…` : journal_entry;
  await sendMessage(
    chatId,
    `✍️ Anotado en <b>${escapeHtml(title)}</b>\n\n${escapeHtml(preview)}`,
  );

  // 4. Si detectó tareas, proponerlas antes de crear nada.
  if (tasks.length > 0) {
    const { text: proposalText, buttons } = renderProposal(tasks);
    await sendMessage(chatId, proposalText, buttons);
  }
}

function audioDocument(message: TelegramMessage): { file_id: string } | undefined {
  const doc = message.document;
  if (doc?.mime_type?.startsWith("audio/")) return { file_id: doc.file_id };
  return undefined;
}

async function handleCommand(chatId: number, text: string): Promise<void> {
  const command = text.split(/\s+/)[0].toLowerCase();

  if (command === "/start" || command === "/help") {
    await sendMessage(
      chatId,
      [
        "<b>Journal</b>",
        "",
        "Mandá un audio o un texto y lo guardo en la página del día en Notion.",
        "Si menciono una tarea puntual con fecha y hora en día laboral, te la propongo antes de crearla.",
        "",
        "Resumen diario por mail a las 21:00. Resumen semanal los domingos.",
      ].join("\n"),
    );
    return;
  }

  await sendMessage(chatId, "No conozco ese comando. Probá /help.");
}

async function handleCallback(query: NonNullable<TelegramUpdate["callback_query"]>) {
  const message = query.message;
  const chatId = message?.chat.id;

  if (!message || !chatId || !isAllowedChat(chatId)) {
    await answerCallbackQuery(query.id);
    return;
  }

  const data = query.data ?? "";
  if (!data.startsWith("t:")) {
    await answerCallbackQuery(query.id);
    return;
  }

  const choice = data.slice(2);
  const proposed = parseProposal(message.text ?? "");

  if (choice === "no") {
    await answerCallbackQuery(query.id, "Descartado");
    await editMessageText(chatId, message.message_id, "✖️ Tareas descartadas.");
    return;
  }

  const selected =
    choice === "all"
      ? proposed
      : proposed.filter((task) => task.index === Number(choice));

  if (selected.length === 0) {
    await answerCallbackQuery(query.id, "No pude releer esa propuesta");
    return;
  }

  await answerCallbackQuery(query.id, "Creando…");

  const created: string[] = [];
  const failed: string[] = [];

  for (const task of selected) {
    try {
      const url = await createTask({
        name: task.name,
        deadlineIso: localToIso(task.datetimeLocal),
        estimatedMinutes: task.estimatedMinutes,
      });
      created.push(
        `✅ <a href="${url}">${escapeHtml(task.name)}</a> — ${humanDateTime(task.datetimeLocal)}`,
      );
    } catch (error) {
      console.error("[journal] no se pudo crear la tarea", error);
      failed.push(`⚠️ ${escapeHtml(task.name)} — ${escapeHtml(describe(error))}`);
    }
  }

  const skipped = proposed.length - selected.length;
  const lines = [...created, ...failed];
  if (skipped > 0) lines.push(`✖️ ${skipped} descartada${skipped === 1 ? "" : "s"}.`);

  await editMessageText(chatId, message.message_id, lines.join("\n"));
}

async function safeSend(chatId: number, text: string): Promise<void> {
  try {
    await sendMessage(chatId, text);
  } catch (error) {
    console.error("[journal] tampoco se pudo avisar por Telegram", error);
  }
}

function describe(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

// Fuerza el chequeo de configuración mínima en tiempo de arranque en frío,
// para que un deploy sin token falle con un mensaje claro en los logs.
export function GET(): Response {
  try {
    required("TELEGRAM_BOT_TOKEN");
    return NextResponse.json({ ok: true, endpoint: "journal" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: describe(error) }, { status: 500 });
  }
}
