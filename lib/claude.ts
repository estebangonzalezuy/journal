/**
 * Todo lo que pasa por la API de Claude: redacción de la entrada de journal,
 * detección de tareas y los dos resúmenes por mail.
 */

import Anthropic from "@anthropic-ai/sdk";

import { CLAUDE_MODEL, required, TIMEZONE } from "./env";
import { isWorkday, localDate, localTime } from "./time";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: required("ANTHROPIC_API_KEY") });
  }
  return client;
}

/**
 * Contexto personal compartido por todos los prompts. Es lo que mantiene la
 * voz: primera persona, directo, sin adornos.
 */
const VOZ = `Escribís en nombre de Esteban González.

Sobre él:
- Motion Director en Reboot Studio.
- Vive en Barcelona con su pareja Julieta y su hija Olivia.
- Organiza lo diario en analógico (bullet journal) y usa Notion como sistema operativo central.

Cómo escribe:
- Español rioplatense, primera persona, voz activa.
- Directo y conciso. Sin cheerleading, sin buzzwords, sin motivación de LinkedIn.
- Frases cortas. Cero relleno introductorio ("Hoy fue un día en el que...").
- No inventa hechos, emociones ni conclusiones que no estén en el material original.`;

export type DetectedTask = {
  name: string;
  /** Fecha y hora local sin zona: "2026-07-31T10:00". */
  datetime_local: string;
  estimated_minutes: number | null;
};

export type ProcessResult = {
  journal_entry: string;
  tasks: DetectedTask[];
};

const PROCESS_SCHEMA = {
  type: "object",
  properties: {
    journal_entry: {
      type: "string",
      description:
        "La entrada de journal redactada en la voz de Esteban, en primera persona.",
    },
    tasks: {
      type: "array",
      description:
        "Tareas puntuales detectadas con fecha y hora concretas en días laborales.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nombre corto y accionable de la tarea, en infinitivo.",
          },
          datetime_local: {
            type: "string",
            description:
              "Fecha y hora local en formato YYYY-MM-DDTHH:MM, sin zona horaria.",
          },
          estimated_minutes: {
            anyOf: [{ type: "integer" }, { type: "null" }],
            description: "Duración estimada en minutos, o null si no se puede inferir.",
          },
        },
        required: ["name", "datetime_local", "estimated_minutes"],
        additionalProperties: false,
      },
    },
  },
  required: ["journal_entry", "tasks"],
  additionalProperties: false,
} as const;

/**
 * Toma el texto crudo (escrito o transcrito) y devuelve la entrada de journal
 * redactada más las tareas puntuales detectadas.
 */
export async function processEntry(rawText: string): Promise<ProcessResult> {
  const now = new Date();
  const today = localDate(now);

  const system = `${VOZ}

Recibís un mensaje crudo que Esteban mandó por Telegram: texto escrito o la transcripción de un audio. Puede venir desordenado, con muletillas y correcciones en voz alta.

Tenés dos trabajos.

1. REDACTAR LA ENTRADA DE JOURNAL
   - Limpiá muletillas, repeticiones y falsos arranques. Mantené el contenido.
   - Conservá los hechos, nombres y números tal como aparecen.
   - Uno o varios párrafos cortos. Sin títulos, sin viñetas, sin emojis.
   - Si el mensaje es solo una tarea suelta sin contenido reflexivo, dejá la entrada en una línea que registre el hecho.

2. DETECTAR TAREAS PUNTUALES
   Incluí una tarea SOLO si se cumple todo esto:
   - Es una acción concreta y puntual, no un deseo vago ni un proyecto abierto.
   - Tiene fecha identificable (explícita como "el 5 de agosto", o relativa como "mañana", "el jueves").
   - Tiene hora identificable, o una franja de la que se pueda deducir una hora razonable ("por la mañana" → 10:00, "después de comer" → 15:00, "a última hora" → 17:00).
   - La fecha resultante cae de lunes a viernes.
   Si algo de eso falta, no la incluyas. Es preferible no proponer nada que proponer ruido.
   No inventes tareas a partir de intenciones generales ("tendría que ponerme con X").

CONTEXTO TEMPORAL
- Ahora mismo: ${today} ${localTime(now)} (zona ${TIMEZONE}).
- Resolvé toda referencia relativa contra esa fecha.
- Devolvé datetime_local en formato YYYY-MM-DDTHH:MM.`;

  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: rawText }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: PROCESS_SCHEMA },
    },
  });

  const result = parseJson<ProcessResult>(message);

  // Red de seguridad: el filtro de "solo días laborales" y el formato de fecha
  // se revalidan del lado del código, no solo en el prompt.
  const tasks = (result.tasks ?? []).filter((task) => {
    if (!task?.name || !task?.datetime_local) return false;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(task.datetime_local)) return false;
    return isWorkday(task.datetime_local.slice(0, 10));
  });

  return { journal_entry: (result.journal_entry ?? "").trim(), tasks };
}

/** Resumen diario a partir del contenido de la página del día. */
export async function dailySummary(dateLabel: string, journalText: string): Promise<string> {
  const system = `${VOZ}

Escribís el resumen del día para un mail que Esteban se manda a sí mismo. Nadie más lo lee.

Formato:
- Arrancá directo con lo que pasó. Sin saludo ni cierre.
- Máximo 150 palabras.
- Si hay varios frentes, usá viñetas cortas con "-". Si no, dos o tres frases.
- Terminá con una línea "Pendiente:" solo si quedó algo abierto y explícito en el texto.
- No agregues consejos, ánimos ni conclusiones que no estén en el material.`;

  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: "user",
        content: `Entradas del journal del ${dateLabel}:\n\n${journalText}`,
      },
    ],
    output_config: { effort: "low" },
  });

  return extractText(message);
}

/** Resumen semanal a partir de las entradas de los últimos 7 días. */
export async function weeklySummary(
  rangeLabel: string,
  days: { label: string; text: string }[],
): Promise<string> {
  const system = `${VOZ}

Escribís el resumen de la semana para un mail que Esteban se manda a sí mismo.

Formato:
- Arrancá directo. Sin saludo ni cierre.
- Máximo 300 palabras.
- Tres bloques, cada uno con su título en una línea:
  "Lo que avanzó" — qué se movió de verdad esta semana.
  "Lo que se repitió" — patrones, fricciones o temas que aparecieron más de una vez.
  "Lo que quedó abierto" — pendientes explícitos.
- Viñetas cortas con "-" dentro de cada bloque.
- Si un bloque no tiene material real, escribí "Nada que registrar." y seguí.
- Nada de interpretación psicológica ni recomendaciones. Solo lo que está en las entradas.`;

  const body = days
    .map((day) => `## ${day.label}\n${day.text || "(sin entradas)"}`)
    .join("\n\n");

  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2500,
    system,
    messages: [
      { role: "user", content: `Entradas del journal, semana del ${rangeLabel}:\n\n${body}` },
    ],
    output_config: { effort: "low" },
  });

  return extractText(message);
}

function extractText(message: Anthropic.Message): string {
  // Claude Opus 5 puede declinar una solicitud devolviendo HTTP 200 con
  // stop_reason "refusal" y content vacío: hay que chequearlo antes de leer.
  if (message.stop_reason === "refusal") {
    throw new Error("Claude rechazó la solicitud (stop_reason: refusal)");
  }

  const chunks: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") chunks.push(block.text);
  }
  const text = chunks.join("").trim();
  if (!text) {
    throw new Error(`Claude devolvió una respuesta vacía (stop_reason: ${message.stop_reason})`);
  }
  return text;
}

function parseJson<T>(message: Anthropic.Message): T {
  const text = extractText(message);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Claude no devolvió JSON válido: ${text.slice(0, 300)}`);
  }
}
