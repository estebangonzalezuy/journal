import { env } from './env';

const API = 'https://api.telegram.org';

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: TelegramMessage;
  };
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  text?: string;
  caption?: string;
  voice?: { file_id: string; mime_type?: string };
  audio?: { file_id: string; mime_type?: string };
  video_note?: { file_id: string };
  document?: { file_id: string; mime_type?: string };
};

export type InlineKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

async function call<T>(method: string, body: unknown): Promise<T> {
  const response = await fetch(`${API}/bot${env.telegramToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok: boolean; result: T; description?: string };
  if (!payload.ok) {
    throw new Error(`Telegram ${method} falló: ${payload.description ?? response.status}`);
  }
  return payload.result;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<TelegramMessage> {
  return call<TelegramMessage>('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
): Promise<void> {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: { inline_keyboard: [] },
  });
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, text });
}

/** Descarga un archivo de Telegram (audios, notas de voz) como Buffer. */
export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; path: string }> {
  const file = await call<{ file_path: string }>('getFile', { file_id: fileId });
  const response = await fetch(`${API}/file/bot${env.telegramToken}/${file.file_path}`);
  if (!response.ok) {
    throw new Error(`No pude descargar el archivo de Telegram (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, path: file.file_path };
}

/** Devuelve el file_id del audio del mensaje, si tiene alguno. */
export function audioFileId(message: TelegramMessage): string | null {
  if (message.voice) return message.voice.file_id;
  if (message.audio) return message.audio.file_id;
  if (message.video_note) return message.video_note.file_id;
  if (message.document?.mime_type?.startsWith('audio/')) return message.document.file_id;
  return null;
}
