import { h, toast, copy } from '../ui.js';
import { getState, transactionsForMonth, monthsWithData, update } from '../store.js';
import { summarise, fmtEur, fmtEur2, monthLabel } from '../aggregate.js';
import { categoryById, BASE_BURN, ACCOUNTS } from '../config.js';
import { HISTORY_BY_MONTH } from '../seed.js';
import { buildMarkdown, buildBlocks, createMonthlyPage, NotionBlockedError } from '../notion.js';

const thisMonth = () => new Date().toISOString().slice(0, 7);

const prevMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return d.toISOString().slice(0, 7);
};

let selected = null;

export default function renderResumen() {
  const state = getState();
  const months = monthsWithData();
  if (!months.length) {
    return h('div', { class: 'empty' },
      h('h2', {}, 'Todavía no hay movimientos'),
      h('p', { class: 'muted' }, 'Importa los extractos PDF del mes y el resumen aparece aquí.'),
      h('p', {}, h('a', { class: 'btn primary', href: '#/importar', style: 'display:inline-block;text-decoration:none' }, 'Importar extractos'))
    );
  }
  if (!selected || !months.includes(selected)) selected = months.includes(thisMonth()) ? thisMonth() : months[0];

  const txs = transactionsForMonth(selected);
  const sum = summarise(txs);
  const prev = summarise(transactionsForMonth(prevMonth(selected)));
  const prevRef = prev.totalMine || HISTORY_BY_MONTH[prevMonth(selected)]?.expense || 0;
  const delta = prevRef ? sum.totalMine - prevRef : null;

  const wrap = h('div');

  wrap.append(h('div', { class: 'row', style: 'margin-bottom:18px' },
    h('div', {},
      h('h1', {}, monthLabel(selected)),
      h('p', { class: 'sub', style: 'margin:0' }, `${sum.txCount} gastos · ${sum.excludedCount} excluidos${sum.needsReview ? ` · ${sum.needsReview} por revisar` : ''}`)
    ),
    h('div', { class: 'spacer' }),
    h('select', { onchange: (e) => { selected = e.target.value; rerender(wrap); } },
      ...months.map((m) => h('option', { value: m, selected: m === selected }, monthLabel(m)))
    )
  ));

  if (sum.needsReview) {
    wrap.append(h('div', { class: 'notice' },
      `${sum.needsReview} movimiento(s) sin categoría clara o con lectura dudosa. `,
      h('a', { href: '#/movimientos' }, 'Revisar ahora →')
    ));
  }

  // ---- KPIs ----
  const kpi = (label, value, foot, cls = '') =>
    h('div', { class: 'kpi' },
      h('div', { class: 'k-label' }, label),
      h('div', { class: `k-value ${cls}` }, value),
      foot ? h('div', { class: 'k-foot' }, foot) : null
    );

  wrap.append(h('div', { class: 'kpis' },
    kpi('Gasto (mi parte)', fmtEur(sum.totalMine),
        delta === null ? 'sin mes anterior' : `${delta >= 0 ? '▲' : '▼'} ${fmtEur(Math.abs(delta))} vs ${monthLabel(prevMonth(selected)).split(' ')[0]}`,
        delta === null ? '' : delta > 0 ? 'neg' : 'pos'),
    kpi('Ingresos', fmtEur(sum.totalIncome), `${txs.filter((t) => t.category === 'income').length} entradas`),
    kpi('Balance', fmtEur(sum.balance), sum.balance >= 0 ? 'mes en positivo' : 'tirando de ahorros', sum.balance >= 0 ? 'pos' : 'neg'),
    kpi('vs base €3.500', `${sum.totalMine > BASE_BURN ? '+' : ''}${fmtEur(sum.totalMine - BASE_BURN)}`,
        'egreso base 2026', sum.totalMine > BASE_BURN ? 'neg' : 'pos')
  ));

  // ---- categories ----
  const maxCat = Math.max(...sum.rows.map((r) => r.mine), 1);
  const cats = h('div', { class: 'card', style: 'margin-bottom:16px' }, h('h2', {}, 'Por categoría'));
  if (!sum.rows.length) cats.append(h('p', { class: 'muted' }, 'Sin gastos categorizados este mes.'));
  for (const r of sum.rows) {
    cats.append(h('div', { class: 'catbar' },
      h('div', { class: 'catname', title: r.label }, r.label),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(r.mine / maxCat) * 100}%;background:${categoryById(r.category).color}` })),
      h('div', { class: 'amt' }, fmtEur(r.mine))
    ));
  }
  wrap.append(cats);

  // ---- fixed vs variable ----
  const fixedPct = sum.totalMine ? Math.round((sum.fixed / sum.totalMine) * 100) : 0;
  wrap.append(h('div', { class: 'card', style: 'margin-bottom:16px' },
    h('h2', {}, 'Fijos vs variables'),
    h('div', { class: 'catbar' },
      h('div', { class: 'catname' }, 'Fijos'),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${fixedPct}%;background:var(--accent)` })),
      h('div', { class: 'amt' }, fmtEur(sum.fixed))),
    h('div', { class: 'catbar' },
      h('div', { class: 'catname' }, 'Variables'),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${100 - fixedPct}%;background:var(--muted)` })),
      h('div', { class: 'amt' }, fmtEur(sum.variable))),
    h('p', { class: 'muted', style: 'font-size:13px;margin:10px 0 0' },
      `Referencia Notion: fijos ~${fmtEur(sum.fixedBaseline)}/mes. Este mes ${fixedPct}% del gasto es fijo.`)
  ));

  wrap.append(exportCard(selected, sum, state));
  return wrap;
}

function rerender(node) {
  node.replaceWith(renderResumen());
}

function exportCard(month, sum, state) {
  const balances = state.balances[month] || {};
  const notes = state.notes[month] || '';
  const card = h('div', { class: 'card' }, h('h2', {}, 'Enviar a Notion'));

  const notesBox = h('textarea', { rows: 3, placeholder: 'Observaciones del mes…' }, notes);
  notesBox.value = notes;
  notesBox.addEventListener('change', () => update((s) => { s.notes[month] = notesBox.value; }));

  const balInputs = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:12px 0' });
  const balFields = [...ACCOUNTS.map((a) => [a.id, a.label]), ['cash', 'Efectivo'], ['tr_invest', 'TR Inversiones'], ['cripto', 'Cripto']];
  for (const [id, label] of balFields) {
    const input = h('input', { type: 'number', step: '0.01', placeholder: '—', value: balances[id] ?? '' });
    input.addEventListener('change', () => update((s) => {
      s.balances[month] = { ...(s.balances[month] || {}), [id]: input.value === '' ? '' : Number(input.value) };
    }));
    balInputs.append(h('label', { class: 'field' }, label, input));
  }

  const status = h('div', { class: 'muted', style: 'font-size:13px' });

  const doCopy = async () => {
    const md = buildMarkdown(month, sum, state.balances[month] || {}, state.notes[month] || '');
    toast(await copy(md) ? 'Markdown copiado — pégalo en Notion' : 'No se pudo copiar');
  };

  const doPush = async () => {
    const { token, parentPageId } = state.notion;
    if (!token) { toast('Falta el token de Notion — ve a Ajustes'); location.hash = '#/ajustes'; return; }
    status.textContent = 'Creando página en Notion…';
    try {
      const page = await createMonthlyPage({
        token, parentPageId,
        title: `Gastos ${monthLabel(month)}`,
        blocks: buildBlocks(month, sum, state.balances[month] || {}, state.notes[month] || ''),
      });
      status.innerHTML = '';
      status.append('Creada: ', h('a', { href: page.url, target: '_blank', rel: 'noopener' }, page.url));
      toast('Página creada en Notion');
    } catch (err) {
      status.textContent = '';
      if (err instanceof NotionBlockedError) {
        status.append(h('span', { class: 'neg' }, err.message + ' '),
          h('button', { class: 'sm', onclick: doCopy }, 'Copiar markdown'));
      } else {
        status.append(h('span', { class: 'neg' }, err.message));
      }
    }
  };

  card.append(
    h('label', { class: 'field' }, 'Observaciones', notesBox),
    h('h3', { style: 'margin-top:16px' }, 'Situación patrimonial (opcional)'),
    balInputs,
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: doPush }, 'Crear página en Notion'),
      h('button', { onclick: doCopy }, 'Copiar markdown'),
      h('button', { onclick: () => {
        const pre = card.querySelector('pre.md');
        if (pre) { pre.remove(); return; }
        card.append(h('pre', { class: 'md' }, buildMarkdown(month, sum, state.balances[month] || {}, state.notes[month] || '')));
      } }, 'Previsualizar')
    ),
    status
  );
  return card;
}
