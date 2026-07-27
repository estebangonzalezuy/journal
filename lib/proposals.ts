/**
 * Propuestas de tarea por Telegram, sin base de datos.
 *
 * El webhook es stateless y Vercel Hobby no trae almacenamiento, así que el
 * estado de una propuesta viaja dentro del propio mensaje: cada tarea lleva una
 * línea marcadora con su fecha ISO. Cuando llega el callback de confirmación,
 * Telegram nos devuelve el texto del mensaje original y lo volvemos a parsear.
 * Cero infraestructura y cero estado que pueda quedar huérfano.
 */

import type { DetectedTask } from "./claude";
import { escapeHtml, type InlineButton } from "./telegram";
import { humanDateTime } from "./time";

export type ParsedTask = {
  index: number;
  name: string;
  datetimeLocal: string;
  estimatedMinutes: number | null;
};

const MARKER = /^#(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?:\|(\d+))?$/;
const HEADING = /^(\d+)\.\s+(.+)$/;

export function renderProposal(tasks: DetectedTask[]): {
  text: string;
  buttons: InlineButton[][];
} {
  const title = tasks.length === 1 ? "Tarea detectada" : `${tasks.length} tareas detectadas`;

  const body = tasks
    .map((task, i) => {
      // El parseo de vuelta es por líneas: un nombre con saltos de línea
      // rompería la correspondencia entre título y marcador.
      const name = task.name.replace(/\s+/g, " ").trim();
      const marker =
        typeof task.estimated_minutes === "number"
          ? `#${task.datetime_local}|${task.estimated_minutes}`
          : `#${task.datetime_local}`;
      return [
        `${i + 1}. <b>${escapeHtml(name)}</b>`,
        humanDateTime(task.datetime_local),
        `<code>${marker}</code>`,
      ].join("\n");
    })
    .join("\n\n");

  const buttons: InlineButton[][] = [];
  if (tasks.length === 1) {
    buttons.push([
      { text: "✅ Crear en Notion", callback_data: "t:1" },
      { text: "✖️ Descartar", callback_data: "t:no" },
    ]);
  } else {
    for (let i = 0; i < tasks.length; i++) {
      buttons.push([{ text: `✅ Solo la ${i + 1}`, callback_data: `t:${i + 1}` }]);
    }
    buttons.push([
      { text: "✅ Todas", callback_data: "t:all" },
      { text: "✖️ Ninguna", callback_data: "t:no" },
    ]);
  }

  return { text: `📌 <b>${title}</b>\n\n${body}`, buttons };
}

/** Reconstruye las tareas propuestas a partir del texto del mensaje. */
export function parseProposal(text: string): ParsedTask[] {
  const lines = text.split("\n");
  const tasks: ParsedTask[] = [];
  let pending: { index: number; name: string } | null = null;

  for (const raw of lines) {
    const line = raw.trim();

    const heading = line.match(HEADING);
    if (heading) {
      pending = { index: Number(heading[1]), name: heading[2].trim() };
      continue;
    }

    const marker = line.match(MARKER);
    if (marker && pending) {
      tasks.push({
        index: pending.index,
        name: pending.name,
        datetimeLocal: marker[1],
        estimatedMinutes: marker[2] ? Number(marker[2]) : null,
      });
      pending = null;
    }
  }

  return tasks;
}
