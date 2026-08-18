// Bank statement line parsers.
//
// Bank PDFs vary wildly, so rather than one brittle regex per bank we use a tolerant
// scanner: find a date at the start of a line, money tokens at the end, and treat the
// middle as the description. Per-bank config only tunes date order, decimal separator
// and how the sign is expressed. Anything ambiguous is flagged for review rather than
// silently guessed.

const MONTHS = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

/** Parse a leading date. Returns { iso, rest } or null. */
function takeDate(line, { dayFirst = true } = {}) {
  let m = line.match(/^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return { iso: iso(+m[1], +m[2], +m[3]), rest: line.slice(m[0].length) };

  m = line.match(/^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    const [d, mo] = dayFirst || a > 12 ? [a, b] : [b, a];
    return { iso: iso(y, mo, d), rest: line.slice(m[0].length) };
  }

  // "12 Aug 2026" / "12 ago 2026" / "12 de agosto de 2026"
  m = line.match(/^\s*(\d{1,2})\s+(?:de\s+)?([a-zA-ZáéíóúÁÉÍÓÚ]{3,10})\.?\s+(?:de\s+)?(\d{4})\b/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return { iso: iso(+m[3], mo, +m[1]), rest: line.slice(m[0].length) };
  }

  // "Aug 12, 2026"
  m = line.match(/^\s*([a-zA-Z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return { iso: iso(+m[3], mo, +m[2]), rest: line.slice(m[0].length) };
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Find money tokens anywhere in a string. */
const MONEY_RE = /(?:^|[\s(])([-+−]?\s?(?:[€£$]\s?)?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|[-+−]?\s?(?:[€£$]\s?)?\d+(?:[.,]\d{2}))\s?([€£$]|EUR|GBP|USD)?(?=$|[\s)])/g;

function toNumber(raw, decimal) {
  let s = raw.replace(/[€£$\s]/g, '').replace(/−/g, '-');
  const neg = s.startsWith('-') || s.startsWith('(');
  s = s.replace(/^[-+(]/, '').replace(/\)$/, '');
  if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

const SYMBOL_CCY = { '€': 'EUR', '£': 'GBP', $: 'USD' };

function findMoney(text, decimal) {
  const out = [];
  MONEY_RE.lastIndex = 0;
  let m;
  while ((m = MONEY_RE.exec(text)) !== null) {
    const value = toNumber(m[1], decimal);
    if (value === null) continue;
    const sym = (m[1].match(/[€£$]/) || [])[0];
    const ccy = SYMBOL_CCY[sym] || (m[2] && (SYMBOL_CCY[m[2]] || m[2].toUpperCase())) || null;
    out.push({ value, currency: ccy, start: m.index, end: m.index + m[0].length, raw: m[1].trim() });
  }
  return out;
}

// --- bank profiles -------------------------------------------------------

export const BANKS = {
  wise_personal:  { label: 'Wise personal',  signatures: [/wise\b/i, /transferwise/i],           decimal: '.', dayFirst: true,  hasBalance: true },
  wise_business:  { label: 'Wise business',  signatures: [/wise business/i],                     decimal: '.', dayFirst: true,  hasBalance: true },
  traderepublic:  { label: 'Trade Republic', signatures: [/trade\s?republic/i],                  decimal: '.', dayFirst: true,  hasBalance: true },
  sabadell:       { label: 'Sabadell',       signatures: [/sabadell/i],                          decimal: ',', dayFirst: true,  hasBalance: true },
  santander:      { label: 'Santander',      signatures: [/santander/i],                         decimal: ',', dayFirst: true,  hasBalance: true },
  openbank:       { label: 'OpenBank',       signatures: [/open\s?bank/i],                       decimal: ',', dayFirst: true,  hasBalance: true },
};

/** Guess which account a statement belongs to from its text. */
export function detectAccount(lines, filename = '') {
  const hay = (filename + '\n' + lines.slice(0, 60).join('\n')).toLowerCase();
  if (/wise/.test(hay)) return /business|jamon|ltd|s\.?l\.?|empresa/.test(hay) ? 'wise_business' : 'wise_personal';
  for (const [id, cfg] of Object.entries(BANKS)) {
    if (cfg.signatures.some((re) => re.test(hay))) return id;
  }
  return null;
}

const NOISE = /^(saldo|balance|total|subtotal|p[áa]gina|page|fecha valor|iban|bic|swift|titular|extracto|statement|resumen|concepto\s+importe|movimientos)\b/i;

/**
 * Parse statement lines into raw transactions.
 * Every result carries `confidence` so the review screen can surface weak rows first.
 */
export function parseLines(lines, accountId, { fallbackCurrency = 'EUR' } = {}) {
  const cfg = BANKS[accountId] || { decimal: ',', dayFirst: true, hasBalance: true };
  const out = [];
  const warnings = [];

  lines.forEach((line, i) => {
    if (!line || line.length < 8 || NOISE.test(line)) return;
    const dated = takeDate(line, cfg);
    if (!dated) return;

    let rest = dated.rest;
    // A second date (fecha valor) right after the first is not part of the description.
    const second = takeDate(rest, cfg);
    if (second) rest = second.rest;

    const money = findMoney(rest, cfg.decimal);
    if (!money.length) return;

    // Trailing numbers are usually [amount, balance]. With one number it is the amount.
    let amountTok;
    let confidence = 'high';
    if (money.length === 1) {
      amountTok = money[0];
    } else if (cfg.hasBalance) {
      amountTok = money[money.length - 2];
    } else {
      amountTok = money[money.length - 1];
    }
    if (money.length > 3) confidence = 'low';

    const description = rest
      .slice(0, amountTok.start)
      .replace(/\s+/g, ' ')
      .replace(/[|;]+/g, ' ')
      .trim();
    if (!description || description.length < 2) {
      confidence = 'low';
    }

    let value = amountTok.value;
    // Some statements express the sign with a word instead of a minus.
    if (/\b(abono|ingreso|entrada|credit|received|recibido)\b/i.test(line) && value < 0) value = Math.abs(value);
    if (/\b(cargo|adeudo|d[ée]bito|debit|sent|pago|salida)\b/i.test(line) && value > 0) value = -value;

    out.push({
      date: dated.iso,
      description: description || '(sin concepto)',
      amount: value,
      currency: amountTok.currency || fallbackCurrency,
      account: accountId,
      confidence,
      rawLine: line,
      lineNo: i,
    });
  });

  if (!out.length) warnings.push('No se reconoció ninguna línea de movimiento. Revisa el texto extraído o pégalo manualmente.');
  const lowCount = out.filter((t) => t.confidence === 'low').length;
  if (lowCount) warnings.push(`${lowCount} línea(s) con lectura dudosa — revísalas antes de confirmar.`);
  return { transactions: out, warnings };
}

/** Stable identity so re-importing the same statement does not duplicate rows. */
export function hashTx(tx) {
  const key = [tx.date, tx.account, tx.amount.toFixed(2), tx.description.toLowerCase().replace(/\s+/g, ' ').slice(0, 40)].join('|');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `${tx.date}-${(h >>> 0).toString(36)}`;
}

export const __test = { takeDate, findMoney, toNumber };
