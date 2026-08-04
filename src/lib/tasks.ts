import type { TareaDetectada } from './claude';
import type { InlineKeyboard } from './telegram';

/**
 * La propuesta de tarea viaja en el propio texto del mensaje de Telegram.
 *
 * Vercel es stateless y el plan Hobby no trae base de datos, así que en vez de
 * guardar la tarea pendiente en algún lado, la escribimos en el mensaje con un
 * formato fijo y la volvemos a leer desde `callback_query.message.text` cuando
 * confirmás. Cero infraestructura, y de paso ves exactamente lo que se va a crear.
 */

export const CONFIRM = 'tarea:ok';
export const CANCEL = 'tarea:no';

export function formatProposal(task: TareaDetectada): string {
  const lines = [
    '📌 Tarea detectada',
    '',
    `Nombre: ${task.nombre}`,
    `Deadline: ${task.fecha} ${task.hora}`,
  ];
  if (task.estimado) lines.push(`Estimado: ${task.estimado}`);
  return lines.join('\n');
}

export function proposalKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '✅ Crear', callback_data: CONFIRM },
        { text: '✕ Descartar', callback_data: CANCEL },
      ],
    ],
  };
}

export function parseProposal(text: string): TareaDetectada | null {
  const field = (label: string): string => {
    const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  const nombre = field('Nombre');
  const deadline = field('Deadline').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (!nombre || !deadline) return null;

  return {
    nombre,
    fecha: deadline[1],
    hora: deadline[2],
    estimado: field('Estimado'),
  };
}
