import { h, toast, download } from '../ui.js';
import { getState, updateTransaction, removeTransaction, monthsWithData, myShare, addRule } from '../store.js';
import { ACCOUNTS, CATEGORIES, categoryById, accountById } from '../config.js';
import { fmtEur2, monthLabel } from '../aggregate.js';
import { categorize } from '../categorize.js';

const filters = { month: 'all', account: 'all', category: 'all', q: '', onlyReview: false };

export default function renderMovimientos() {
  const state = getState();
  const wrap = h('div');
  wrap.append(h('h1', {}, 'Movimientos'));

  if (!state.transactions.length) {
    return h('div', { class: 'empty' }, h('h2', {}, 'Sin movimientos'),
      h('p', { class: 'muted' }, 'Importa un extracto para empezar.'));
  }

  const months = monthsWithData();
  const mk = (opts, key, labelFn = (v) => v) => {
    const sel = h('select', {}, h('option', { value: 'all' }, 'Todos'),
      ...opts.map((o) => h('option', { value: o, selected: filters[key] === o }, labelFn(o))));
    sel.value = filters[key];
    sel.addEventListener('change', () => { filters[key] = sel.value; refresh(wrap); });
    return sel;
  };

  const search = h('input', { type: 'text', placeholder: 'Buscar concepto…', value: filters.q, style: 'min-width:180px' });
  search.addEventListener('input', () => { filters.q = search.value; refresh(wrap); });

  const reviewToggle = h('label', { class: 'row', style: 'gap:6px;font-size:14px;cursor:pointer' },
    h('input', { type: 'checkbox', checked: filters.onlyReview, onchange: (e) => { filters.onlyReview = e.target.checked; refresh(wrap); } }),
    'Solo por revisar');

  wrap.append(h('div', { class: 'row', style: 'margin-bottom:14px' },
    mk(months, 'month', monthLabel),
    mk(ACCOUNTS.map((a) => a.id), 'account', (id) => accountById(id).label),
    mk(CATEGORIES.map((c) => c.id), 'category', (id) => categoryById(id).label),
    search, reviewToggle,
    h('div', { class: 'spacer' }),
    h('button', { class: 'sm', onclick: () => exportCsv() }, 'Exportar CSV')
  ));

  wrap.append(h('div', { id: 'txhost' }));
  refresh(wrap);
  return wrap;
}

function visible() {
  const s = getState();
  return s.transactions.filter((t) => {
    if (filters.month !== 'all' && !t.date.startsWith(filters.month)) return false;
    if (filters.account !== 'all' && t.account !== filters.account) return false;
    if (filters.category !== 'all' && t.category !== filters.category) return false;
    if (filters.q && !`${t.description} ${t.note}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    if (filters.onlyReview && !(t.confidence === 'low' || (t.review && t.category === 'other'))) return false;
    return true;
  });
}

function refresh(wrap) {
  const host = wrap.querySelector('#txhost');
  if (!host) return;
  const rows = visible();
  const total = rows.filter((t) => t.category !== 'excluded' && t.category !== 'income')
    .reduce((s, t) => s + Math.abs(myShare(t)), 0);

  host.innerHTML = '';
  host.append(h('p', { class: 'sub' }, `${rows.length} movimientos · mi parte ${fmtEur2(total)}`));

  const tbody = h('tbody');
  for (const t of rows) tbody.append(row(t, wrap));
  host.append(h('div', { class: 'card' }, h('div', { class: 'table-wrap' },
    h('table', {}, h('thead', {}, h('tr', {},
      h('th', {}, 'Fecha'), h('th', {}, 'Concepto'), h('th', {}, 'Cuenta'),
      h('th', { class: 'num' }, 'Importe'), h('th', { class: 'num' }, 'Mi parte'),
      h('th', {}, 'Categoría'), h('th', {}, '%'), h('th', {}, ''))), tbody))));
}

function row(t, wrap) {
  const tr = h('tr', { class: [t.category === 'excluded' ? 'tx-excluded' : '', t.confidence === 'low' ? 'tx-low' : ''].join(' ') });

  const catSel = h('select', {}, ...CATEGORIES.map((c) => h('option', { value: c.id, selected: c.id === t.category }, c.label)));
  catSel.addEventListener('change', () => { updateTransaction(t.id, { category: catSel.value, ruleIndex: -2 }); refresh(wrap); });

  const shareSel = h('select', {},
    h('option', { value: '1', selected: t.share === 1 }, '100'),
    h('option', { value: '0.5', selected: t.share === 0.5 }, '50'));
  shareSel.addEventListener('change', () => { updateTransaction(t.id, { share: Number(shareSel.value) }); refresh(wrap); });

  tr.append(
    h('td', { class: 'mono' }, t.date),
    h('td', { title: t.rawLine || '' },
      h('div', { style: 'max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.description),
      t.note ? h('div', { class: 'muted', style: 'font-size:12px' }, t.note) : null),
    h('td', { class: 'muted', style: 'font-size:13px' }, accountById(t.account)?.label || t.account),
    h('td', { class: 'num mono' }, t.currency === 'EUR' ? fmtEur2(t.amount) : `${t.amount} ${t.currency}`),
    h('td', { class: 'num mono' }, fmtEur2(myShare(t))),
    h('td', {}, catSel),
    h('td', {}, shareSel),
    h('td', {},
      h('button', { class: 'sm', title: 'Guardar como regla', onclick: () => {
        const guess = t.description.replace(/[^a-zA-Z0-9áéíóúñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)[0] || t.description.slice(0, 10);
        const pattern = prompt('Texto que debe coincidir en el futuro:', guess.toLowerCase());
        if (!pattern) return;
        addRule({ match: pattern.toLowerCase(), category: t.category, share: t.share });
        toast('Regla guardada');
      } }, '＋regla'),
      h('button', { class: 'sm danger', onclick: () => { if (confirm('¿Borrar este movimiento?')) removeTransaction(t.id); } }, '✕'))
  );
  return tr;
}

function exportCsv() {
  const rows = visible();
  const head = ['fecha', 'concepto', 'cuenta', 'importe', 'moneda', 'importe_eur', 'mi_parte_eur', 'categoria', 'share', 'nota'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [head.join(','), ...rows.map((t) => [
    t.date, t.description, accountById(t.account)?.label, t.amount, t.currency,
    t.amountEur?.toFixed(2), myShare(t).toFixed(2), categoryById(t.category).label, t.share, t.note,
  ].map(esc).join(','))].join('\n');
  download(`movimientos-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}
