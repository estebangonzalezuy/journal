import { h, lineChart } from '../ui.js';
import { getState } from '../store.js';
import { monthlyTotals, fmtEur, monthLabel } from '../aggregate.js';
import { HISTORY, HISTORY_BY_MONTH } from '../seed.js';
import { BASE_BURN } from '../config.js';

export default function renderHistorico() {
  const state = getState();
  const live = monthlyTotals(state.transactions);
  const liveByMonth = Object.fromEntries(live.map((m) => [m.month, m]));

  // Live data wins over the Notion snapshot for any month you have imported.
  const months = [...new Set([...HISTORY.map((h) => h.month), ...live.map((m) => m.month)])].sort();
  const merged = months.map((m) => {
    const l = liveByMonth[m];
    const seed = HISTORY_BY_MONTH[m];
    return {
      month: m,
      expense: l?.expense ?? seed?.expense ?? 0,
      income: l?.income ?? seed?.income ?? 0,
      origin: l ? 'tracker' : 'notion',
      source: l ? 'Importado aquí' : seed?.source,
    };
  });

  const wrap = h('div');
  wrap.append(h('h1', {}, 'Histórico'));
  wrap.append(h('p', { class: 'sub' },
    'Los meses que importes aquí sustituyen al dato de Notion. El resto viene de tus páginas “Histórico completo” y “Balance 2025”.'));

  const totals2026 = merged.filter((m) => m.month.startsWith('2026'));
  const avg26 = totals2026.length ? totals2026.reduce((s, m) => s + m.expense, 0) / totals2026.length : 0;

  wrap.append(h('div', { class: 'kpis' },
    kpi('Meses registrados', String(merged.length), `${live.length} desde el tracker`),
    kpi('Media 2026', fmtEur(avg26), 'gasto mensual'),
    kpi('Base de referencia', fmtEur(BASE_BURN), 'egreso base 2026 (Notion)'),
    kpi('Mes más caro', fmtEur(Math.max(...merged.map((m) => m.expense), 0)),
        monthLabel(merged.reduce((a, b) => (b.expense > a.expense ? b : a), merged[0]).month))
  ));

  const chart = lineChart([
    { color: 'var(--neg)', points: merged.map((m) => ({ x: m.month, y: m.expense })) },
    { color: 'var(--pos)', points: merged.map((m) => ({ x: m.month, y: m.income })) },
    { color: 'var(--muted)', dashed: true, width: 1.4, points: merged.map((m) => ({ x: m.month, y: BASE_BURN })) },
  ], { height: 230, format: (n) => `${Math.round(n / 1000)}k` });

  wrap.append(h('div', { class: 'card', style: 'margin-bottom:16px' },
    h('div', { class: 'row', style: 'margin-bottom:8px' },
      h('h2', { style: 'margin:0' }, 'Gastos vs ingresos'),
      h('div', { class: 'spacer' }),
      legend('var(--neg)', 'Gastos'), legend('var(--pos)', 'Ingresos'), legend('var(--muted)', 'Base €3.500')),
    chart));

  const tbody = h('tbody');
  for (const m of [...merged].reverse()) {
    const bal = m.income - m.expense;
    tbody.append(h('tr', {},
      h('td', {}, monthLabel(m.month)),
      h('td', { class: 'num mono' }, fmtEur(m.expense)),
      h('td', { class: 'num mono' }, fmtEur(m.income)),
      h('td', { class: `num mono ${bal >= 0 ? 'pos' : 'neg'}` }, fmtEur(bal)),
      h('td', {}, h('span', { class: `badge ${m.origin === 'tracker' ? 'ok' : ''}` }, m.origin === 'tracker' ? 'tracker' : 'Notion')),
      h('td', { class: 'muted', style: 'font-size:12px' }, m.source || '')
    ));
  }
  wrap.append(h('div', { class: 'card' }, h('div', { class: 'table-wrap' },
    h('table', {}, h('thead', {}, h('tr', {},
      h('th', {}, 'Mes'), h('th', { class: 'num' }, 'Gastos'), h('th', { class: 'num' }, 'Ingresos'),
      h('th', { class: 'num' }, 'Balance'), h('th', {}, 'Origen'), h('th', {}, 'Fuente'))), tbody))));
  return wrap;
}

const kpi = (label, value, foot) =>
  h('div', { class: 'kpi' }, h('div', { class: 'k-label' }, label),
    h('div', { class: 'k-value' }, value), h('div', { class: 'k-foot' }, foot));

const legend = (color, label) =>
  h('span', { class: 'row', style: 'gap:5px;font-size:12.5px;color:var(--muted)' },
    h('span', { style: `width:11px;height:3px;border-radius:2px;background:${color};display:inline-block` }), label);
