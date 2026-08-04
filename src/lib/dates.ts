import { TIMEZONE } from './env';

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function partsOf(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // Intl puede devolver "24" a medianoche según el runtime.
    hour: parts.hour === '24' ? '00' : parts.hour,
    minute: parts.minute,
  };
}

/** "YYYY-MM-DD" en la zona horaria configurada. */
export function isoDate(date: Date = new Date()): string {
  const { year, month, day } = partsOf(date);
  return `${year}-${month}-${day}`;
}

/** Título de la subpágina de Notion: formato "D/M", sin ceros a la izquierda. */
export function dayTitle(date: Date = new Date()): string {
  const { month, day } = partsOf(date);
  return `${Number(day)}/${Number(month)}`;
}

/** "HH:MM" en la zona horaria configurada. */
export function timeLabel(date: Date = new Date()): string {
  const { hour, minute } = partsOf(date);
  return `${hour}:${minute}`;
}

/** Nombre del día en español, para darle contexto a Claude. */
export function weekdayName(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    weekday: 'long',
  }).format(date);
}

/** Los últimos `count` días, del más viejo al más nuevo, incluyendo hoy. */
export function lastDays(count: number, from: Date = new Date()): Date[] {
  const days: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    days.push(new Date(from.getTime() - i * 24 * 60 * 60 * 1000));
  }
  return days;
}

/** Día de la semana 0-6 (domingo = 0) en la zona horaria configurada. */
export function weekdayIndex(isoDay: string): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(`${isoDay}T12:00:00Z`));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

export function isWeekday(isoDay: string): boolean {
  const index = weekdayIndex(isoDay);
  return index >= 1 && index <= 5;
}

function offsetFor(instant: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'longOffset',
  });
  const name = formatter
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;
  const offset = (name ?? 'GMT+00:00').replace('GMT', '');
  return offset === '' ? '+00:00' : offset;
}

/**
 * Combina fecha ("YYYY-MM-DD") y hora ("HH:MM") en un timestamp con offset,
 * que es lo que espera la propiedad Date de Notion para conservar la hora.
 */
export function toNotionDate(day: string, time: string): string {
  const approximate = new Date(`${day}T${time}:00Z`);
  return `${day}T${time}:00${offsetFor(approximate)}`;
}

/** "lunes 4 de agosto" — para los asuntos de mail. */
export function longDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}
