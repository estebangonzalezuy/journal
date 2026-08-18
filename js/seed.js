// Historical monthly totals lifted from the Notion pages.
// Expenses are quoted directly from "Balance 2025 — Datos oficiales de tu tracker".
// The 2025 income column is DERIVED: Notion lists freelance income per month in GBP and
// only gives a net annual EUR figure, so each month is converted at the £1 = €1,14237
// rate stated on that page. Treat those as approximations, not booked figures.
// "Histórico completo — Jul 2024 → Abr 2026" and "Gastos Junio 2026".
// These are read-only reference points for the trend chart; they are not transactions.
export const HISTORY = [
  { month: '2025-01', expense: 3671.92, income: 5938,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-02', expense: 4718.71, income: 9136,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-03', expense: 2848.95, income: 9364,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-04', expense: 2640.79, income: 9136,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-05', expense: 3269.07, income: 4568,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-06', expense: 2797.79, income: 402,   source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-07', expense: 5028.32, income: 0,     source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-08', expense: 3466.70, income: 400,   source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-09', expense: 2710.07, income: 1596,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-10', expense: 2719.76, income: 927,   source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-11', expense: 2504.67, income: 0,     source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2025-12', expense: 3009.05, income: 1343,  source: 'Notion: Balance 2025 · ingresos derivados de £ × 1,14237' },
  { month: '2026-01', expense: 4240,    income: 757,   source: 'Notion: Histórico 2026' },
  { month: '2026-02', expense: 4235,    income: 4823,  source: 'Notion: Histórico 2026' },
  { month: '2026-03', expense: 3407,    income: 1134,  source: 'Notion: Histórico 2026' },
  { month: '2026-04', expense: 5295,    income: 7325,  source: 'Notion: Histórico 2026 (parcial 1–23)' },
  { month: '2026-06', expense: 2727,    income: 0,     source: 'Notion: Gastos Junio 2026' },
];

export const HISTORY_BY_MONTH = Object.fromEntries(HISTORY.map((h) => [h.month, h]));
