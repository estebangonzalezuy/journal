import { h, toast, $$ } from '../ui.js';
import { pdfToLines, looksScanned } from '../pdftext.js';
import { parseLines, detectAccount, hashTx, BANKS } from '../parsers.js';
import { categorize, markInternalTransfers, findDuplicates } from '../categorize.js';
import { getState, addTransactions, addRule, toEur } from '../store.js';
import { ACCOUNTS, CATEGORIES, accountById } from '../config.js';
import { fmtEur2 } from '../aggregate.js';

// Rows awaiting confirmation. Kept in module scope so navigating away and back
// during a review does not lose work in progress.
let staged = [];
let files = [];

export default function renderImportar() {
  const wrap = h('div');
  wrap.append(h('h1', {}, 'Importar extractos'));
  wrap.append(h('p', { class: 'sub' },
    'Arrastra los PDF del mes. Se leen en tu navegador — ningún archivo se sube a ningún servidor.'));

  const zone = h('div', { class: 'dropzone' },
    h('h2', {}, '📄 Suelta aquí los PDF'),
    h('p', { class: 'muted' }, 'Wise · Trade Republic · Sabadell · Santander · OpenBank — o haz clic para elegir')
  );
  const picker = h('input', { type: 'file', accept: 'application/pdf,.pdf,.txt', multiple: true, style: 'display:none' });
  zone.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => handleFiles([...picker.files], wrap));
  ['dragenter', 'dragover'].forEach((e) => zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', (ev) => handleFiles([...ev.dataTransfer.files], wrap));
  wrap.append(zone, picker);

  // Paste-text escape hatch for statements that extract badly.
  const pasteArea = h('textarea', { rows: 5, placeholder: '…o pega aquí las líneas del extracto (una por movimiento)' });
  const pasteAccount = h('select', {}, ...ACCOUNTS.map((a) => h('option', { value: a.id }, a.label)));
  wrap.append(h('details', { style: 'margin-top:14px' },
    h('summary', { class: 'muted', style: 'cursor:pointer;font-size:14px' }, 'Pegar texto en vez de PDF'),
    h('div', { class: 'card', style: 'margin-top:10px' },
      pasteArea,
      h('div', { class: 'row', style: 'margin-top:10px' }, pasteAccount,
        h('button', { onclick: () => {
          const lines = pasteArea.value.split('\n').map((l) => l.trim()).filter(Boolean);
          if (!lines.length) return toast('Pega algunas líneas primero');
          ingest(lines, pasteAccount.value, 'texto pegado', wrap);
          pasteArea.value = '';
        } }, 'Analizar texto'))
    )
  ));

  wrap.append(h('div', { id: 'filelist', style: 'margin-top:16px' }));
  wrap.append(h('div', { id: 'review' }));
  if (staged.length) renderReview(wrap);
  renderFileList(wrap);
  return wrap;
}

async function handleFiles(list, wrap) {
  for (const file of list) {
    const entry = { name: file.name, status: 'leyendo…', count: 0 };
    files.push(entry);
    renderFileList(wrap);
    try {
      let lines;
      if (/\.txt$/i.test(file.name)) lines = (await file.text()).split('\n');
      else lines = await pdfToLines(file);

      if (looksScanned(lines)) {
        entry.status = 'PDF escaneado: sin texto legible. Exporta el extracto en PDF de texto o CSV, o pega las líneas a mano.';
        entry.error = true;
        renderFileList(wrap);
        continue;
      }
      const account = detectAccount(lines, file.name);
      const added = ingest(lines, account, file.name, wrap, entry);
      entry.status = account ? `${added} movimientos · ${BANKS[account]?.label || account}` : `${added} movimientos · banco no detectado`;
      entry.count = added;
      entry.needsAccount = !account;
    } catch (err) {
      console.error(err);
      entry.status = `No se pudo leer: ${err.message}`;
      entry.error = true;
    }
    renderFileList(wrap);
  }
}

function ingest(lines, accountId, sourceName, wrap, entry) {
  const acc = accountId || 'sabadell';
  const { transactions, warnings } = parseLines(lines, acc);
  const state = getState();
  const rows = transactions.map((t, i) => {
    const amountEur = toEur(t.amount, t.currency, state.fx);
    const base = { ...t, id: `${sourceName}-${i}-${Math.random().toString(36).slice(2, 7)}`, amountEur, source: sourceName };
    const cat = categorize(base, state.rules);
    return { ...base, ...cat };
  });
  markInternalTransfers([...staged, ...rows]);
  staged.push(...rows);
  if (entry) entry.warnings = warnings;
  renderReview(wrap);
  return rows.length;
}

function renderFileList(wrap) {
  const host = wrap.querySelector('#filelist');
  if (!host) return;
  host.innerHTML = '';
  for (const f of files) {
    host.append(h('div', { class: 'filechip' },
      h('strong', {}, f.name),
      h('span', { class: `badge ${f.error ? 'low' : 'ok'}` }, f.status),
      ...(f.warnings || []).map((w) => h('span', { class: 'badge low' }, w))
    ));
  }
}

function renderReview(wrap) {
  const host = wrap.querySelector('#review');
  if (!host) return;
  host.innerHTML = '';
  if (!staged.length) return;

  const state = getState();
  const dupes = findDuplicates(staged);
  const lowCount = staged.filter((t) => t.confidence === 'low').length;
  const uncategorised = staged.filter((t) => t.review && t.category === 'other').length;

  host.append(h('div', { class: 'row', style: 'margin:22px 0 12px' },
    h('h2', { style: 'margin:0' }, `Revisar ${staged.length} movimientos`),
    h('div', { class: 'spacer' }),
    h('button', { class: 'danger sm', onclick: () => { staged = []; files = []; renderReview(wrap); renderFileList(wrap); } }, 'Descartar todo'),
    h('button', { class: 'primary', onclick: () => commit(wrap) }, 'Confirmar e importar')
  ));

  if (lowCount || uncategorised || dupes.length) {
    host.append(h('div', { class: 'notice' },
      [lowCount && `${lowCount} línea(s) con lectura dudosa (marcadas en ámbar)`,
       uncategorised && `${uncategorised} sin categoría clara`,
       dupes.length && `${dupes.length} posible(s) duplicado(s)`].filter(Boolean).join(' · ')
    ));
  }

  const tbody = h('tbody');
  staged.forEach((t) => tbody.append(reviewRow(t, wrap)));

  host.append(h('div', { class: 'card' }, h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Fecha'), h('th', {}, 'Concepto'), h('th', {}, 'Cuenta'),
        h('th', { class: 'num' }, 'Importe'), h('th', {}, 'Categoría'), h('th', {}, 'Mi parte'), h('th', {}, '')
      )),
      tbody
    )
  )));
}

function reviewRow(t, wrap) {
  const state = getState();
  const tr = h('tr', { class: [t.category === 'excluded' ? 'tx-excluded' : '', t.confidence === 'low' ? 'tx-low' : ''].join(' ') });

  const catSel = h('select', { class: 'sm' },
    ...CATEGORIES.map((c) => h('option', { value: c.id, selected: c.id === t.category }, c.label)));
  catSel.addEventListener('change', () => {
    t.category = catSel.value;
    tr.classList.toggle('tx-excluded', t.category === 'excluded');
  });

  const shareSel = h('select', {},
    h('option', { value: '1', selected: t.share === 1 }, '100%'),
    h('option', { value: '0.5', selected: t.share === 0.5 }, '50%'));
  shareSel.addEventListener('change', () => { t.share = Number(shareSel.value); });

  const accSel = h('select', {}, ...ACCOUNTS.map((a) => h('option', { value: a.id, selected: a.id === t.account }, a.label)));
  accSel.addEventListener('change', () => {
    t.account = accSel.value;
    t.share = accountById(t.account)?.defaultShare ?? 1;
    shareSel.value = String(t.share);
  });

  const amtInput = h('input', { type: 'number', step: '0.01', value: t.amount, style: 'width:100px' });
  const ccySel = h('select', {}, ...['EUR', 'GBP', 'USD'].map((c) => h('option', { value: c, selected: c === t.currency }, c)));
  const syncAmount = () => {
    t.amount = Number(amtInput.value);
    t.currency = ccySel.value;
    t.amountEur = toEur(t.amount, t.currency, getState().fx);
    eurLabel.textContent = t.currency === 'EUR' ? '' : ` = ${fmtEur2(t.amountEur)}`;
  };
  const eurLabel = h('span', { class: 'muted', style: 'font-size:12px' }, t.currency === 'EUR' ? '' : ` = ${fmtEur2(t.amountEur)}`);
  amtInput.addEventListener('change', syncAmount);
  ccySel.addEventListener('change', syncAmount);

  tr.append(
    h('td', { class: 'mono' }, t.date),
    h('td', { title: t.rawLine || '' }, h('div', { style: 'max-width:290px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.description),
      t.note ? h('div', { class: 'muted', style: 'font-size:12px' }, t.note) : null),
    h('td', {}, accSel),
    h('td', { class: 'num' }, h('div', { class: 'row', style: 'justify-content:flex-end;gap:4px;flex-wrap:nowrap' }, amtInput, ccySel), eurLabel),
    h('td', {}, catSel),
    h('td', {}, shareSel),
    h('td', {},
      h('button', { class: 'sm', title: 'Crear regla para este comercio', onclick: () => makeRule(t, wrap) }, '＋regla'),
      h('button', { class: 'sm danger', title: 'Quitar', onclick: () => { staged = staged.filter((x) => x !== t); renderReview(wrap); } }, '✕'))
  );
  return tr;
}

function makeRule(t, wrap) {
  const guess = t.description.replace(/[^a-zA-Z0-9áéíóúñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)[0] || t.description.slice(0, 10);
  const pattern = prompt('Texto que debe coincidir (se guarda como regla para futuros meses):', guess.toLowerCase());
  if (!pattern) return;
  addRule({ match: pattern.toLowerCase(), category: t.category, share: t.share });
  // Re-run categorisation over everything still staged so the new rule takes effect now.
  const state = getState();
  for (const row of staged) Object.assign(row, categorize(row, state.rules));
  renderReview(wrap);
  toast(`Regla guardada: "${pattern}" → ${CATEGORIES.find((c) => c.id === t.category).label}`);
}

function commit(wrap) {
  const state = getState();
  const rows = staged.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    amountEur: t.amountEur,
    account: t.account,
    category: t.category,
    share: t.share,
    note: t.note || '',
    source: t.source,
    confidence: t.confidence,
    ruleIndex: t.ruleIndex,
    rawLine: t.rawLine || '',
    hash: hashTx(t),
  }));
  const { added, skipped } = addTransactions(rows);
  staged = [];
  files = [];
  toast(`${added} movimientos importados${skipped ? ` · ${skipped} ya existían` : ''}`);
  location.hash = '#/resumen';
}
