/** Transcripción de audio con Whisper (API de OpenAI). */

import { required, TRANSCRIBE_MODEL } from "./env";

export async function transcribe(blob: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", TRANSCRIBE_MODEL);
  // Sesgo de idioma: los audios son en español. Si algún día grabás en otro
  // idioma, borrá esta línea y Whisper lo detecta solo.
  form.append("language", "es");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${required("OPENAI_API_KEY")}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Whisper falló (${res.status}): ${detail.slice(0, 400)}`);
  }

  const body = (await res.json()) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) {
    throw new Error("Whisper devolvió una transcripción vacía");
  }
  return text;
}
