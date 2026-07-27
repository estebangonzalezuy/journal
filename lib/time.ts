/**
 * Utilidades de fecha/hora en una zona horaria concreta (Europe/Madrid por
 * defecto), sin dependencias externas. Todo se apoya en Intl.DateTimeFormat.
 */

import { TIMEZONE } from "./env";

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Descompone un instante en sus partes de calendario dentro de la zona dada. */
export function zonedParts(date: Date, timeZone: string = TIMEZONE): Parts {
  const map: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl puede devolver "24" para medianoche en algunos runtimes.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset de la zona respecto a UTC, en minutos, para un instante concreto. */
export function offsetMinutes(date: Date, timeZone: string = TIMEZONE): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** "+02:00" a partir de minutos de offset. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convierte una fecha/hora local ingenua ("2026-07-31T10:00") en un ISO 8601
 * con offset explícito ("2026-07-31T10:00:00+02:00"), que es lo que Notion
 * necesita para guardar una hora concreta.
 */
export function localToIso(local: string, timeZone: string = TIMEZONE): string {
  const match = local.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) {
    throw new Error(`Fecha local con formato inesperado: ${local}`);
  }
  const [, y, mo, d, h, mi, s] = match;
  const naiveUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0"),
  );

  // Dos pasadas: la primera estima el offset, la segunda lo corrige si el
  // instante cae al otro lado de un cambio de horario.
  let guess = new Date(naiveUtc - offsetMinutes(new Date(naiveUtc), timeZone) * 60000);
  guess = new Date(naiveUtc - offsetMinutes(guess, timeZone) * 60000);

  return `${y}-${mo}-${d}T${h}:${mi}:${pad(Number(s ?? "0"))}${formatOffset(
    offsetMinutes(guess, timeZone),
  )}`;
}

/** Fecha local en formato ISO corto: "2026-07-27". */
export function localDate(date: Date = new Date(), timeZone: string = TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Hora local "21:45". */
export function localTime(date: Date = new Date(), timeZone: string = TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Título de la página del día en Notion, formato "D/M" sin ceros a la
 * izquierda (27/7).
 */
export function journalTitle(date: Date = new Date(), timeZone: string = TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.day}/${p.month}`;
}

/** Igual que journalTitle pero a partir de una fecha "YYYY-MM-DD". */
export function journalTitleFromDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** Suma (o resta) días a una fecha local "YYYY-MM-DD". */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Día de la semana de una fecha local: 0 = domingo … 6 = sábado. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** true si la fecha cae de lunes a viernes. */
export function isWorkday(isoDate: string): boolean {
  const day = weekdayOf(isoDate);
  return day >= 1 && day <= 5;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "vie 31/07 · 10:00" para mostrar en Telegram. */
export function humanDateTime(local: string): string {
  const [datePart, timePart = ""] = local.split("T");
  const [, m, d] = datePart.split("-");
  const label = DIAS[weekdayOf(datePart)];
  return timePart ? `${label} ${d}/${m} · ${timePart.slice(0, 5)}` : `${label} ${d}/${m}`;
}

/** "27 de julio de 2026" para asuntos de mail. */
export function humanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Los 7 días que terminan en `endDate` (incluido), del más viejo al más nuevo. */
export function lastSevenDays(endDate: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(endDate, i - 6));
}
