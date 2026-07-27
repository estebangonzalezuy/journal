/** Cliente mínimo de la Bot API de Telegram. */

import { required } from "./env";

const API = "https://api.telegram.org";

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string };
  text?: string;
  caption?: string;
  voice?: { file_id: string; duration: number; mime_type?: string };
  audio?: { file_id: string; duration: number; mime_type?: string };
  video_note?: { file_id: string; duration: number };
  document?: { file_id: string; mime_type?: string; file_name?: string };
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from: { id: number };
  message?: TelegramMessage;
};

export type InlineButton = { text: string; callback_data: string };

async function call<T>(method: string, payload: unknown): Promise<T> {
  const token = required("TELEGRAM_BOT_TOKEN");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!body.ok) {
    throw new Error(`Telegram ${method} falló: ${body.description ?? res.status}`);
  }
  return body.result as T;
}

export async function sendMessage(
  chatId: number,
  text: string,
  buttons?: InlineButton[][],
): Promise<TelegramMessage> {
  return call<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export async function sendChatAction(chatId: number, action = "typing"): Promise<void> {
  try {
    await call("sendChatAction", { chat_id: chatId, action });
  } catch {
    // El indicador de "escribiendo…" es cosmético: nunca debe romper el flujo.
  }
}

/** Descarga un fichero de Telegram (audio) y lo devuelve como Blob. */
export async function downloadFile(fileId: string): Promise<{ blob: Blob; name: string }> {
  const token = required("TELEGRAM_BOT_TOKEN");
  const file = await call<{ file_path: string }>("getFile", { file_id: fileId });
  const res = await fetch(`${API}/file/bot${token}/${file.file_path}`);
  if (!res.ok) {
    throw new Error(`No se pudo descargar el audio de Telegram (${res.status})`);
  }
  const blob = await res.blob();
  const name = file.file_path.split("/").pop() || "audio.ogg";
  return { blob, name };
}

/** Escapa texto para parse_mode HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
