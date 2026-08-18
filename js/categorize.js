// Rule-based categorisation + the exclusion logic documented in the Notion template.
import { accountById } from './config.js';

/** Apply the first matching rule. Returns { category, share, note, ruleIndex }. */
export function categorize(tx, rules) {
  const hay = `${tx.description} ${tx.rawLine || ''}`.toLowerCase();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    let hit = false;
    try {
      hit = new RegExp(r.match, 'i').test(hay);
    } catch {
      hit = hay.includes(String(r.match).toLowerCase());
    }
    if (hit) {
      return {
        category: r.category,
        share: r.share ?? accountById(tx.account)?.defaultShare ?? 1,
        note: r.note || '',
        review: !!r.review,
        ruleIndex: i,
      };
    }
  }
  // No rule matched: income if positive, otherwise Other for manual review.
  return {
    category: tx.amount > 0 ? 'income' : 'other',
    share: accountById(tx.account)?.defaultShare ?? 1,
    note: '',
    review: tx.amount < 0,
    ruleIndex: -1,
  };
}

/**
 * Flag transfers between the user's own accounts: an outgoing amount that reappears
 * as an incoming amount of the same size on another account within a few days.
 * The Notion rules say these must not count as spending.
 */
export function markInternalTransfers(txs, { windowDays = 4, tolerance = 0.02 } = {}) {
  const pairs = [];
  const used = new Set();
  const out = txs.filter((t) => t.amountEur < 0);
  const inc = txs.filter((t) => t.amountEur > 0);

  for (const a of out) {
    if (used.has(a.id)) continue;
    for (const b of inc) {
      if (used.has(b.id) || b.account === a.account) continue;
      const sameSize = Math.abs(Math.abs(a.amountEur) - b.amountEur) <= Math.max(tolerance, Math.abs(a.amountEur) * 0.015);
      const days = Math.abs(new Date(b.date) - new Date(a.date)) / 86400000;
      if (sameSize && days <= windowDays) {
        used.add(a.id); used.add(b.id);
        pairs.push([a, b]);
        break;
      }
    }
  }
  for (const [a, b] of pairs) {
    a.category = 'excluded'; a.note = (a.note ? a.note + ' · ' : '') + `Traspaso a ${b.account}`;
    b.category = 'excluded'; b.note = (b.note ? b.note + ' · ' : '') + `Traspaso desde ${a.account}`;
    a.autoExcluded = true; b.autoExcluded = true;
  }
  return pairs.length;
}

/** Detect the same charge landing on two statements (e.g. a shared card seen twice). */
export function findDuplicates(txs) {
  const seen = new Map();
  const dupes = [];
  for (const t of txs) {
    const key = `${t.date}|${Math.abs(t.amountEur).toFixed(2)}|${t.description.toLowerCase().slice(0, 16)}`;
    if (seen.has(key)) dupes.push([seen.get(key), t]);
    else seen.set(key, t);
  }
  return dupes;
}
