import { env } from './env';

/**
 * Transcribe un audio con Whisper (API de OpenAI).
 * `filename` importa: OpenAI infiere el formato por la extensión.
 */
export async function transcribe(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), filename);
  form.append('model', 'whisper-1');
  form.append('language', 'es');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.openaiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Whisper falló (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { text: string };
  return payload.text.trim();
}
