import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { analizarEntrada } from '@/lib/claude';
import { dayTitle, isoDate, timeLabel, weekdayName } from '@/lib/dates';
import { appendEntry, createTask, findOrCreateDayPage } from '@/lib/notion';
import {
  answerCallbackQuery,
  audioFileId,
  downloadFile,
  editMessageText,
  sendMessage,
  type TelegramMessage,
  type TelegramUpdate,
} from '@/lib/telegram';
import { transcribe } from '@/lib/transcribe';
import { CANCEL, CONFIRM, formatProposal, parseProposal, proposalKeyboard } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Webhook de Telegram. Siempre responde 200: si devolviéramos error, Telegram
 * reintentaría el mismo update y terminaríamos con entradas duplicadas.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== env.telegramWebhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) {
      await handleCallback(update);
    } else {
      const message = update.message ?? update.edited_message;
      if (message) await handleMessage(message);
    }
  } catch (error) {
    console.error('journal webhook', error);
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId && String(chatId) === env.telegramAllowedChatId) {
      await sendMessage(chatId, `⚠️ Algo falló: ${describe(error)}`).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAllowed(chatId: number): boolean {
  return String(chatId) === env.telegramAllowedChatId;
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  if (!isAllowed(message.chat.id)) return;

  const chatId = message.chat.id;
  const fileId = audioFileId(message);
  let texto = (message.text ?? message.caption ?? '').trim();

  if (fileId) {
    const { buffer, path } = await downloadFile(fileId);
    const extension = path.split('.').pop() || 'ogg';
    const transcripcion = await transcribe(buffer, `audio.${extension}`);
    texto = [texto, transcripcion].filter(Boolean).join('\n');
  }

  if (!texto) {
    await sendMessage(chatId, 'No pillé nada. Mandame texto o un audio.');
    return;
  }

  const now = new Date();
  const analisis = await analizarEntrada(texto, isoDate(now), weekdayName(now), timeLabel(now));

  const pageId = await findOrCreateDayPage(dayTitle(now));
  await appendEntry(pageId, timeLabel(now), analisis.entrada);
  await sendMessage(chatId, `📓 Guardado en ${dayTitle(now)}.`);

  for (const tarea of analisis.tareas) {
    await sendMessage(chatId, formatProposal(tarea), proposalKeyboard());
  }
}

async function handleCallback(update: TelegramUpdate): Promise<void> {
  const query = update.callback_query!;
  const message = query.message;
  if (!message || !isAllowed(message.chat.id)) return;

  if (query.data === CANCEL) {
    await answerCallbackQuery(query.id, 'Descartada');
    await editMessageText(message.chat.id, message.message_id, `${message.text}\n\n✕ Descartada`);
    return;
  }

  if (query.data !== CONFIRM) {
    await answerCallbackQuery(query.id);
    return;
  }

  const tarea = parseProposal(message.text ?? '');
  if (!tarea) {
    await answerCallbackQuery(query.id, 'No pude leer la tarea');
    return;
  }

  // Telegram espera la respuesta al callback en pocos segundos.
  await answerCallbackQuery(query.id, 'Creando…');

  try {
    const url = await createTask(tarea);
    await editMessageText(
      message.chat.id,
      message.message_id,
      `${message.text}\n\n✅ Creada en Notion\n${url}`,
    );
  } catch (error) {
    await editMessageText(
      message.chat.id,
      message.message_id,
      `${message.text}\n\n⚠️ No la pude crear: ${describe(error)}`,
    );
  }
}
