// Turns a PDF File into plain text lines using a locally vendored pdf.js (no CDN, no upload).
import * as pdfjs from '../vendor/pdf.min.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;

/** Rebuild visual lines by bucketing text items on their y coordinate. */
function itemsToLines(items) {
  const rows = new Map();
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 2) * 2; // 2pt tolerance for wobbly baselines
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: item.transform[4], str: item.str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, cells]) =>
      cells.sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

export async function pdfToLines(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...itemsToLines(content.items));
  }
  await doc.destroy();
  return lines;
}

/** True when a PDF yielded almost no text - i.e. it is a scan and needs OCR we do not have. */
export const looksScanned = (lines) => lines.join('').replace(/\s/g, '').length < 40;
