// Notion write-back.
//
// Two paths, because api.notion.com may or may not answer cross-origin requests from a
// static page: we try the real API first and, if the browser blocks it, fall back to
// clipboard markdown that pastes into Notion as native tables.
import { fmtEur2, monthLabel } from './aggregate.js';
import { ACCOUNTS, accountById } from './config.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

// ---- markdown (fallback + preview) --------------------------------------

export function buildMarkdown(month, summary, balances = {}, notes = '') {
  const L = [];
  L.push(`# Gastos ${monthLabel(month)}`, '');
  L.push('| Categoría | Mis cuentas | Ajuste Tricount | Real |');
  L.push('| --- | --- | --- | --- |');
  for (const r of summary.rows) {
    const adj = r.adjust === 0 ? '—' : `${r.adjust > 0 ? '+' : ''}${fmtEur2(r.adjust)}`;
    L.push(`| ${r.label} | ${fmtEur2(r.raw)} | ${adj} | ${fmtEur2(r.mine)} |`);
  }
  const totalAdj = summary.totalMine - summary.totalRaw;
  L.push(`| **TOTAL** | **${fmtEur2(summary.totalRaw)}** | **${totalAdj >= 0 ? '+' : ''}${fmtEur2(totalAdj)}** | **${fmtEur2(summary.totalMine)}** |`);
  L.push('');
  L.push('## Balance', '');
  L.push('| | Valor |', '| --- | --- |');
  L.push(`| Ingresos | ${fmtEur2(summary.totalIncome)} |`);
  L.push(`| Gastos | ${fmtEur2(summary.totalMine)} |`);
  L.push(`| **Balance** | **${fmtEur2(summary.balance)}** |`);
  L.push(`| Gastos fijos | ${fmtEur2(summary.fixed)} |`);
  L.push(`| Gastos variables | ${fmtEur2(summary.variable)} |`);
  L.push('');
  if (Object.keys(balances).length) {
    L.push('## Situación patrimonial', '', '| Cuenta | Saldo |', '| --- | --- |');
    let liquid = 0;
    for (const acc of ACCOUNTS) {
      const v = balances[acc.id];
      if (v == null || v === '') continue;
      liquid += Number(v) || 0;
      L.push(`| ${acc.label} | ${fmtEur2(Number(v))} |`);
    }
    if (balances.cash) { liquid += Number(balances.cash); L.push(`| Efectivo billetes | ${fmtEur2(Number(balances.cash))} |`); }
    L.push(`| **Liquidez total** | **${fmtEur2(liquid)}** |`);
    if (balances.tr_invest) L.push(`| TR Inversiones | ${fmtEur2(Number(balances.tr_invest))} |`);
    if (balances.cripto) L.push(`| Cripto | ~${fmtEur2(Number(balances.cripto))} |`);
    const total = liquid + (Number(balances.tr_invest) || 0) + (Number(balances.cripto) || 0);
    L.push(`| **Patrimonio total** | **${fmtEur2(total)}** |`);
    L.push('');
  }
  if (notes) L.push('## Observaciones del mes', '', notes, '');
  L.push(`> Generado desde el Spending Tracker · ${summary.txCount} movimientos · ${summary.excludedCount} excluidos`);
  return L.join('\n');
}

// ---- Notion blocks ------------------------------------------------------

const text = (content, bold = false) => ({
  type: 'text', text: { content: String(content).slice(0, 2000) }, annotations: { bold },
});

const heading = (content, level = 2) => ({
  object: 'block', type: `heading_${level}`, [`heading_${level}`]: { rich_text: [text(content)] },
});

const paragraph = (content) => ({
  object: 'block', type: 'paragraph', paragraph: { rich_text: content ? [text(content)] : [] },
});

const row = (cells, bold = false) => ({
  object: 'block', type: 'table_row',
  table_row: { cells: cells.map((c) => [text(c, bold)]) },
});

const table = (header, rows) => ({
  object: 'block', type: 'table',
  table: {
    table_width: header.length,
    has_column_header: true,
    has_row_header: false,
    children: [row(header, true), ...rows.map((r) => row(r))],
  },
});

export function buildBlocks(month, summary, balances = {}, notes = '') {
  const blocks = [];
  blocks.push(heading(`Gastos ${monthLabel(month)}`, 1));
  blocks.push(table(
    ['Categoría', 'Mis cuentas', 'Ajuste Tricount', 'Real'],
    [
      ...summary.rows.map((r) => [
        r.label,
        fmtEur2(r.raw),
        r.adjust === 0 ? '—' : `${r.adjust > 0 ? '+' : ''}${fmtEur2(r.adjust)}`,
        fmtEur2(r.mine),
      ]),
      ['TOTAL', fmtEur2(summary.totalRaw), fmtEur2(summary.totalMine - summary.totalRaw), fmtEur2(summary.totalMine)],
    ]
  ));
  blocks.push(heading('Balance'));
  blocks.push(table(['', 'Valor'], [
    ['Ingresos', fmtEur2(summary.totalIncome)],
    ['Gastos', fmtEur2(summary.totalMine)],
    ['Balance', fmtEur2(summary.balance)],
    ['Gastos fijos', fmtEur2(summary.fixed)],
    ['Gastos variables', fmtEur2(summary.variable)],
  ]));

  const patrimonio = [];
  let liquid = 0;
  for (const acc of ACCOUNTS) {
    const v = balances[acc.id];
    if (v == null || v === '') continue;
    liquid += Number(v) || 0;
    patrimonio.push([acc.label, fmtEur2(Number(v))]);
  }
  if (balances.cash) { liquid += Number(balances.cash); patrimonio.push(['Efectivo billetes', fmtEur2(Number(balances.cash))]); }
  if (patrimonio.length) {
    patrimonio.push(['Liquidez total', fmtEur2(liquid)]);
    if (balances.tr_invest) patrimonio.push(['TR Inversiones', fmtEur2(Number(balances.tr_invest))]);
    if (balances.cripto) patrimonio.push(['Cripto', fmtEur2(Number(balances.cripto))]);
    patrimonio.push(['Patrimonio total', fmtEur2(liquid + (Number(balances.tr_invest) || 0) + (Number(balances.cripto) || 0))]);
    blocks.push(heading('Situación patrimonial'));
    blocks.push(table(['Cuenta', 'Saldo'], patrimonio));
  }

  if (notes) { blocks.push(heading('Observaciones del mes')); blocks.push(paragraph(notes)); }
  blocks.push(paragraph(`Generado desde el Spending Tracker · ${summary.txCount} movimientos · ${summary.excludedCount} excluidos`));
  return blocks;
}

// ---- API ----------------------------------------------------------------

export class NotionBlockedError extends Error {}

async function call(token, path, body, method = 'POST') {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // A CORS rejection or blocked request surfaces here as an opaque TypeError.
    throw new NotionBlockedError(
      'El navegador no pudo llamar a la API de Notion (CORS o red). Usa el botón de copiar markdown.'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Notion respondió ${res.status}`);
  return data;
}

/** Create the monthly report as a child page under the Finances 26 page. */
export async function createMonthlyPage({ token, parentPageId, title, blocks }) {
  const page = await call(token, '/pages', {
    parent: { type: 'page_id', page_id: parentPageId },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: blocks.slice(0, 100),
  });
  // Notion accepts at most 100 children per request; append the rest.
  for (let i = 100; i < blocks.length; i += 100) {
    await call(token, `/blocks/${page.id}/children`, { children: blocks.slice(i, i + 100) }, 'PATCH');
  }
  return page;
}

export async function testConnection(token) {
  return call(token, '/users/me', null, 'GET');
}
