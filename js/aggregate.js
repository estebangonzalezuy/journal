// Turns transactions into the numbers the dashboard and the Notion report need.
import { CATEGORIES, categoryById, FIXED_BASELINE } from './config.js';
import { myShare, monthOf } from './store.js';

export function summarise(txs) {
  const spend = txs.filter((t) => t.category !== 'excluded' && t.category !== 'income' && t.amountEur < 0);
  const income = txs.filter((t) => t.category === 'income' && t.amountEur > 0);

  const byCategory = new Map();
  for (const t of spend) {
    const raw = Math.abs(t.amountEur);
    const mine = Math.abs(myShare(t));
    const cur = byCategory.get(t.category) || { category: t.category, raw: 0, mine: 0, count: 0 };
    cur.raw += raw; cur.mine += mine; cur.count++;
    byCategory.set(t.category, cur);
  }

  const rows = [...byCategory.values()]
    .map((r) => ({ ...r, label: categoryById(r.category).label, adjust: r.mine - r.raw }))
    .sort((a, b) => b.mine - a.mine);

  const totalMine = rows.reduce((s, r) => s + r.mine, 0);
  const totalRaw = rows.reduce((s, r) => s + r.raw, 0);
  const totalIncome = income.reduce((s, t) => s + t.amountEur, 0);

  const fixedIds = new Set(CATEGORIES.filter((c) => c.fixed).map((c) => c.id));
  const fixed = rows.filter((r) => fixedIds.has(r.category)).reduce((s, r) => s + r.mine, 0);

  return {
    rows,
    totalMine,
    totalRaw,
    totalIncome,
    balance: totalIncome - totalMine,
    fixed,
    variable: totalMine - fixed,
    fixedBaseline: FIXED_BASELINE,
    txCount: spend.length,
    excludedCount: txs.filter((t) => t.category === 'excluded').length,
    needsReview: txs.filter((t) => t.confidence === 'low' || (t.review && t.category === 'other')).length,
  };
}

export function monthlyTotals(txs) {
  const map = new Map();
  for (const t of txs) {
    const m = monthOf(t.date);
    const cur = map.get(m) || { month: m, expense: 0, income: 0 };
    if (t.category === 'excluded') { /* skip */ }
    else if (t.category === 'income') cur.income += t.amountEur;
    else if (t.amountEur < 0) cur.expense += Math.abs(myShare(t));
    map.set(m, cur);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

export const fmtEur2 = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);

export const monthLabel = (m) => {
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [y, mo] = m.split('-');
  return `${names[+mo - 1]} ${y}`;
};
