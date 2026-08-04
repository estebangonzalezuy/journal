import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';
import { isWeekday } from './dates';

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey });
  return client;
}

/** Contexto sobre Esteban, para que la voz del journal sea la suya. */
const VOZ = `Sobre quien escribe:
- Motion Director en Reboot Studio. Vive en Barcelona con su pareja Julieta y su hija Olivia.
- Organización analógica-first (bullet journal), pero Notion es su sistema operativo central.
- Estilo: directo, conciso, sin cheerleading ni buzzwords. Español rioplatense, voseo.`;

export type TareaDetectada = {
  nombre: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  estimado: string; // "" si no se mencionó
};

export type AnalisisEntrada = {
  entrada: string;
  tareas: TareaDetectada[];
};

const ESQUEMA_ENTRADA = {
  type: 'object',
  properties: {
    entrada: {
      type: 'string',
      description: 'La entrada de journal redactada en primera persona.',
    },
    tareas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          fecha: { type: 'string', description: 'YYYY-MM-DD' },
          hora: { type: 'string', description: 'HH:MM en 24h' },
          estimado: {
            type: 'string',
            description: 'Duración estimada mencionada, ej "30m" o "2h". Vacío si no se dijo.',
          },
        },
        required: ['nombre', 'fecha', 'hora', 'estimado'],
        additionalProperties: false,
      },
    },
  },
  required: ['entrada', 'tareas'],
  additionalProperties: false,
} as const;

function primerTexto(content: Anthropic.ContentBlock[]): string {
  const bloque = content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!bloque) throw new Error('Claude no devolvió texto');
  return bloque.text;
}

/**
 * Separa lo que dictaste en (a) entrada de journal y (b) tareas puntuales
 * con fecha y hora que caen en día laboral.
 */
export async function analizarEntrada(
  texto: string,
  hoy: string,
  diaSemana: string,
  hora: string,
): Promise<AnalisisEntrada> {
  const response = await anthropic().messages.create({
    model: env.anthropicModel,
    max_tokens: 8000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ESQUEMA_ENTRADA },
    },
    system: `Sos el asistente de journal de Esteban. Recibís lo que dictó o escribió durante el día y hacés dos cosas.

${VOZ}

1. ENTRADA: redactá lo que contó como entrada de journal, en primera persona y en su voz. Limpiá muletillas y errores de transcripción, pero no inventes hechos, no agregues reflexiones que no dijo y no resumas al punto de perder detalle. Si dictó varias cosas sueltas, escribilas como párrafos separados. Sin títulos ni encabezados: solo el texto.

2. TAREAS: extraé únicamente tareas puntuales y accionables que él tenga que hacer, con fecha Y hora identificables. Reglas estrictas:
   - Solo tareas que caigan de lunes a viernes. Descartá las de sábado o domingo.
   - Solo si hay fecha y hora deducibles del texto. "La semana que viene veo eso" no es una tarea; "el martes a las 10 llamo a Marina" sí.
   - Resolvé referencias relativas ("mañana", "el martes") contra la fecha de hoy.
   - Si no hay ninguna tarea que cumpla esto, devolvé una lista vacía. No fuerces.
   - El nombre de la tarea es corto e imperativo: "Llamar a Marina", "Mandar el cut a Nico".

Contexto temporal: hoy es ${diaSemana} ${hoy}, son las ${hora} en Barcelona.`,
    messages: [{ role: 'user', content: texto }],
  });

  const parsed = JSON.parse(primerTexto(response.content)) as AnalisisEntrada;

  return {
    entrada: parsed.entrada.trim(),
    // Segundo filtro del lado del servidor: el modelo puede equivocarse de día.
    tareas: (parsed.tareas ?? []).filter(
      (tarea) => /^\d{4}-\d{2}-\d{2}$/.test(tarea.fecha) && isWeekday(tarea.fecha),
    ),
  };
}

/** Resumen del día a partir del contenido de la página de Notion. */
export async function resumenDiario(contenido: string, fecha: string): Promise<string> {
  const response = await anthropic().messages.create({
    model: env.anthropicModel,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system: `Escribís el resumen diario del journal de Esteban, que le llega por mail.

${VOZ}

Formato: 4 a 8 líneas. Sin encabezados, sin markdown, sin bullets decorativos. Directo, en segunda persona ("hoy hiciste...") o impersonal, lo que quede más natural. Nombrá lo concreto que pasó. Si hay algo pendiente o algo que quedó dando vueltas, cerrá con eso en una línea. Nada de motivación ni de felicitaciones.`,
    messages: [
      {
        role: 'user',
        content: `Entradas del ${fecha}:\n\n${contenido}`,
      },
    ],
  });

  return primerTexto(response.content).trim();
}

/** Resumen semanal a partir de los días que tengan entradas. */
export async function resumenSemanal(contenido: string, rango: string): Promise<string> {
  const response = await anthropic().messages.create({
    model: env.anthropicModel,
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    system: `Escribís el resumen semanal del journal de Esteban, que le llega por mail los domingos.

${VOZ}

Formato: dos o tres párrafos cortos. Sin encabezados ni markdown. Contá el arco de la semana, no un listado día por día: qué avanzó, qué se trabó, qué se repitió. Si ves un patrón (algo que aparece varios días, algo que viene postergándose), nombralo sin dramatizar. Cerrá con lo que queda abierto para la semana que viene. Nada de motivación ni de felicitaciones.`,
    messages: [
      {
        role: 'user',
        content: `Entradas de la semana (${rango}):\n\n${contenido}`,
      },
    ],
  });

  return primerTexto(response.content).trim();
}
