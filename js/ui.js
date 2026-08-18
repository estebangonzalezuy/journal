// Small DOM helpers - no framework, no build step.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function confirmed(msg) { return window.confirm(msg); }

export function download(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Minimal responsive line/bar chart as inline SVG. */
export function lineChart(series, { height = 200, format = (n) => n, highlight = null } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const w = 800, pad = { l: 46, r: 12, t: 14, b: 26 };
  const values = series.flatMap((s) => s.points.map((p) => p.y));
  const max = Math.max(...values, 1) * 1.12;
  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const n = Math.max(labels.length - 1, 1);
  const X = (i) => pad.l + (i * (w - pad.l - pad.r)) / n;
  const Y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.style.overflow = 'visible';

  const mk = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  // gridlines
  for (let g = 0; g <= 3; g++) {
    const v = (max / 3) * g;
    svg.append(mk('line', { x1: pad.l, x2: w - pad.r, y1: Y(v), y2: Y(v), stroke: 'currentColor', 'stroke-opacity': .1 }));
    const t = mk('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor', 'fill-opacity': .5 });
    t.textContent = format(v);
    svg.append(t);
  }
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.y)}`).join(' ');
    svg.append(mk('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.2, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dashed ? '5 4' : '' }));
    s.points.forEach((p, i) => {
      const r = highlight && p.x === highlight ? 5 : 3;
      const c = mk('circle', { cx: X(i), cy: Y(p.y), r, fill: s.color });
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${p.x} · ${format(p.y)}`;
      c.append(title);
      svg.append(c);
    });
  }
  labels.forEach((lab, i) => {
    if (labels.length > 14 && i % 2) return;
    const t = mk('text', { x: X(i), y: height - 6, 'text-anchor': 'middle', 'font-size': 10, fill: 'currentColor', 'fill-opacity': .55 });
    t.textContent = lab.slice(2);
    svg.append(t);
  });
  return svg;
}
