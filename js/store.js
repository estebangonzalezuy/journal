// Single source of truth. Everything lives in localStorage - no bank data leaves the browser.
import { DEFAULT_FX, SEED_RULES, accountById } from './config.js';

const KEY = 'spendtracker.v1';

const emptyState = () => ({
  version: 1,
  transactions: [],   // committed transactions
  rules: SEED_RULES.map((r) => ({ ...r, seeded: true })),
  fx: { ...DEFAULT_FX },
  balances: {},       // { 'YYYY-MM': { accountId: amount, cripto: n, tr_invest: n, cash: n } }
  notes: {},          // { 'YYYY-MM': 'observaciones' }
  notion: { token: '', parentPageId: '34b1c0b2-f62f-800b-915f-d5f86e0a4d9f' },
  lastImport: null,
});

let state = emptyState();
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...emptyState(), ...parsed };
      // Re-seed rules that shipped with a newer version of the app.
      const known = new Set(state.rules.map((r) => r.match));
      for (const r of SEED_RULES) if (!known.has(r.match)) state.rules.push({ ...r, seeded: true });
    }
  } catch (err) {
    console.error('Could not read saved data, starting fresh', err);
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Save failed - localStorage may be full', err);
    alert('No se pudo guardar en el navegador. Exporta un backup JSON desde Ajustes.');
  }
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function update(mutator) {
  mutator(state);
  save();
}

// ---- transactions -------------------------------------------------------

export function addTransactions(txs) {
  const existing = new Set(state.transactions.map((t) => t.hash));
  const fresh = txs.filter((t) => !existing.has(t.hash));
  state.transactions.push(...fresh);
  state.transactions.sort((a, b) => (a.date < b.date ? 1 : -1));
  state.lastImport = new Date().toISOString();
  save();
  return { added: fresh.length, skipped: txs.length - fresh.length };
}

export function updateTransaction(id, patch) {
  const tx = state.transactions.find((t) => t.id === id);
  if (tx) Object.assign(tx, patch);
  save();
}

export function removeTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  save();
}

// ---- rules --------------------------------------------------------------

export function addRule(rule) {
  state.rules.unshift({ ...rule, seeded: false });
  save();
}

export function removeRule(index) {
  state.rules.splice(index, 1);
  save();
}

// ---- derived ------------------------------------------------------------

export const monthOf = (isoDate) => (isoDate || '').slice(0, 7);

export function monthsWithData() {
  return [...new Set(state.transactions.map((t) => monthOf(t.date)))].sort().reverse();
}

export function transactionsForMonth(month) {
  return state.transactions.filter((t) => monthOf(t.date) === month);
}

/** Amount actually attributable to Esteban, in EUR. */
export function myShare(tx) {
  const share = tx.share ?? accountById(tx.account)?.defaultShare ?? 1;
  return tx.amountEur * share;
}

export function toEur(amount, currency, fx = state.fx) {
  return amount * (fx[currency] ?? 1);
}

// ---- backup -------------------------------------------------------------

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.transactions)) throw new Error('Backup inválido: falta "transactions"');
  state = { ...emptyState(), ...parsed };
  save();
}

export function resetAll() {
  state = emptyState();
  save();
}
