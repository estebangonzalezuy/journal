import { h, toast, download, copy } from '../ui.js';
import { getState, update, addRule, removeRule, exportJson, importJson, resetAll } from '../store.js';
import { CATEGORIES, categoryById, DEFAULT_FX } from '../config.js';
import { testConnection, NotionBlockedError } from '../notion.js';

export default function renderAjustes() {
  const state = getState();
  const wrap = h('div');
  wrap.append(h('h1', {}, 'Ajustes'));

  // ---- Notion ----
  const token = h('input', { type: 'password', placeholder: 'ntn_…', value: state.notion.token, style: 'width:100%' });
  const parent = h('input', { type: 'text', value: state.notion.parentPageId, style: 'width:100%' });
  const notionStatus = h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px' });

  wrap.append(h('div', { class: 'card', style: 'margin-bottom:16px' },
    h('h2', {}, 'Notion'),
    h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:0' },
      'Crea una integración interna en notion.so/my-integrations, compártela con la página “Finances 26” y pega aquí el token. Se guarda solo en este navegador.'),
    h('label', { class: 'field', style: 'margin-bottom:10px' }, 'Token de integración', token),
    h('label', { class: 'field' }, 'ID de la página padre (Finances 26)', parent),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'primary', onclick: () => {
        update((s) => { s.notion.token = token.value.trim(); s.notion.parentPageId = parent.value.trim(); });
        toast('Guardado');
      } }, 'Guardar'),
      h('button', { onclick: async () => {
        notionStatus.textContent = 'Probando…';
        try {
          const me = await testConnection(token.value.trim());
          notionStatus.innerHTML = '';
          notionStatus.append(h('span', { class: 'pos' }, `Conectado como ${me.name || me.bot?.owner?.type || 'integración'}`));
        } catch (err) {
          notionStatus.innerHTML = '';
          notionStatus.append(h('span', { class: 'neg' }, err.message));
          if (err instanceof NotionBlockedError) {
            notionStatus.append(h('div', { style: 'margin-top:6px' },
              'Sin problema: el botón “Copiar markdown” del Resumen produce tablas que se pegan en Notion tal cual.'));
          }
        }
      } }, 'Probar conexión')),
    notionStatus
  ));

  // ---- FX ----
  const fxCard = h('div', { class: 'card', style: 'margin-bottom:16px' }, h('h2', {}, 'Tipos de cambio'),
    h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:0' }, 'A EUR. Notion usa £1 = €1,17 y $1 = €0,92 — actualízalos si cambian más de un 5%.'));
  const fxRow = h('div', { class: 'row' });
  for (const ccy of ['GBP', 'USD']) {
    const input = h('input', { type: 'number', step: '0.0001', value: state.fx[ccy] ?? DEFAULT_FX[ccy], style: 'width:110px' });
    input.addEventListener('change', () => { update((s) => { s.fx[ccy] = Number(input.value); }); toast(`${ccy} actualizado`); });
    fxRow.append(h('label', { class: 'field' }, `1 ${ccy} =`, input));
  }
  fxCard.append(fxRow);
  wrap.append(fxCard);

  // ---- rules ----
  const rulesCard = h('div', { class: 'card', style: 'margin-bottom:16px' },
    h('h2', {}, `Reglas de categorización (${state.rules.length})`),
    h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:0' },
      'Se aplican de arriba abajo; gana la primera que coincida. Acepta texto simple o expresión regular.'));

  const newMatch = h('input', { type: 'text', placeholder: 'p. ej. mercadona', style: 'min-width:170px' });
  const newCat = h('select', {}, ...CATEGORIES.map((c) => h('option', { value: c.id }, c.label)));
  const newShare = h('select', {}, h('option', { value: '1' }, '100%'), h('option', { value: '0.5' }, '50%'));
  rulesCard.append(h('div', { class: 'row', style: 'margin-bottom:14px' }, newMatch, newCat, newShare,
    h('button', { class: 'primary sm', onclick: () => {
      if (!newMatch.value.trim()) return toast('Escribe el texto a buscar');
      addRule({ match: newMatch.value.trim().toLowerCase(), category: newCat.value, share: Number(newShare.value) });
      newMatch.value = '';
      toast('Regla añadida');
    } }, 'Añadir regla')));

  const tbody = h('tbody');
  state.rules.forEach((r, i) => tbody.append(h('tr', {},
    h('td', {}, h('code', { class: 'inline' }, r.match)),
    h('td', {}, categoryById(r.category).label),
    h('td', {}, r.share === 0.5 ? '50%' : r.share === 1 ? '100%' : '—'),
    h('td', {}, r.seeded ? h('span', { class: 'badge' }, 'inicial') : h('span', { class: 'badge ok' }, 'tuya')),
    h('td', { class: 'num' }, h('button', { class: 'sm danger', onclick: () => removeRule(i) }, '✕'))
  )));
  rulesCard.append(h('div', { class: 'table-wrap', style: 'max-height:420px;overflow-y:auto' },
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Coincide con'), h('th', {}, 'Categoría'),
      h('th', {}, 'Mi parte'), h('th', {}, 'Origen'), h('th', {}, ''))), tbody)));
  wrap.append(rulesCard);

  // ---- backup ----
  const fileIn = h('input', { type: 'file', accept: '.json', style: 'display:none' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try {
      importJson(await f.text());
      toast('Backup restaurado');
      location.hash = '#/resumen';
    } catch (err) { toast(`No se pudo importar: ${err.message}`); }
  });

  wrap.append(h('div', { class: 'card' },
    h('h2', {}, 'Copia de seguridad'),
    h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:0' },
      `Todo vive en este navegador (${getState().transactions.length} movimientos). Si borras los datos del sitio, se pierde — exporta de vez en cuando.`),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => download(`spending-tracker-${new Date().toISOString().slice(0, 10)}.json`, exportJson()) }, 'Exportar backup'),
      h('button', { onclick: () => fileIn.click() }, 'Restaurar backup'),
      fileIn,
      h('div', { class: 'spacer' }),
      h('button', { class: 'danger', onclick: () => {
        if (confirm('Esto borra todos los movimientos y reglas guardados. ¿Seguro?')) { resetAll(); toast('Datos borrados'); location.hash = '#/resumen'; }
      } }, 'Borrar todo'))
  ));

  return wrap;
}
