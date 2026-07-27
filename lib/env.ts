/**
 * Lectura de variables de entorno. Nada se lee en tiempo de import: los
 * endpoints piden lo que necesitan cuando lo necesitan, para que un deploy sin
 * la key de Resend (por ejemplo) no rompa el webhook de Telegram.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/** Zona horaria usada para fechas de journal, deadlines y crons. */
export const TIMEZONE = process.env.TIMEZONE || "Europe/Madrid";

/** Modelo de Claude para redacción, extracción de tareas y resúmenes. */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

/** Modelo de transcripción de OpenAI. */
export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
