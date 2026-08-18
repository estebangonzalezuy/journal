// Static configuration: accounts, categories, FX defaults, categorisation rules.
// Everything here can be overridden by the user in Settings (stored in localStorage).

export const ACCOUNTS = [
  { id: 'wise_personal',  label: 'Wise personal',    currencies: ['EUR', 'GBP', 'USD'], defaultShare: 1,   color: '#3ba0f5' },
  { id: 'wise_business',  label: 'Wise business',    currencies: ['EUR', 'GBP'],        defaultShare: 1,   color: '#1e6fb8', business: true },
  { id: 'traderepublic',  label: 'Trade Republic',   currencies: ['EUR'],               defaultShare: 1,   color: '#111827' },
  { id: 'sabadell',       label: 'Sabadell',         currencies: ['EUR'],               defaultShare: 1,   color: '#0aa5a5' },
  { id: 'santander',      label: 'Santander',        currencies: ['EUR'],               defaultShare: 1,   color: '#e2413a' },
  { id: 'openbank',       label: 'OpenBank (shared)',currencies: ['EUR'],               defaultShare: 0.5, color: '#f08c1e', shared: true },
];

export const accountById = (id) => ACCOUNTS.find((a) => a.id === id);

// Categories mirror the Notion monthly template so exports drop straight in.
export const CATEGORIES = [
  { id: 'house',        label: 'House & Family',        fixed: true,  color: '#6366f1' },
  { id: 'groceries',    label: 'Groceries',             fixed: false, color: '#22c55e' },
  { id: 'bars',         label: 'Bars & Restaurants',    fixed: false, color: '#f97316' },
  { id: 'taxes',        label: 'Professional Services (impuestos)', fixed: true, color: '#ef4444' },
  { id: 'biztools',     label: 'Business Tools',        fixed: true,  color: '#0ea5e9' },
  { id: 'professional', label: 'Professional Services', fixed: false, color: '#14b8a6' },
  { id: 'health',       label: 'Health & Sport',        fixed: true,  color: '#ec4899' },
  { id: 'car',          label: 'Transport: Car',        fixed: true,  color: '#a855f7' },
  { id: 'transport',    label: 'Transport: Public',     fixed: false, color: '#8b5cf6' },
  { id: 'subs',         label: 'Subscriptions',         fixed: true,  color: '#eab308' },
  { id: 'travel',       label: 'Travel',                fixed: false, color: '#06b6d4' },
  { id: 'entertainment',label: 'Entertainment',         fixed: false, color: '#f43f5e' },
  { id: 'other',        label: 'Other',                 fixed: false, color: '#94a3b8' },
  { id: 'savings',      label: 'Savings & Inversiones', fixed: false, color: '#64748b' },
  { id: 'income',       label: 'Ingresos',              fixed: false, color: '#16a34a', income: true },
  { id: 'excluded',     label: 'Excluido',              fixed: false, color: '#cbd5e1', excluded: true },
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.find((c) => c.id === 'other');
export const SPEND_CATEGORIES = CATEGORIES.filter((c) => !c.income && !c.excluded);

export const DEFAULT_FX = { EUR: 1, GBP: 1.17, USD: 0.92 };

// Monthly fixed baseline from the Notion template (~EUR1.700).
export const FIXED_BASELINE = 1700;
export const BASE_BURN = 3500; // 2026 planning number from Historico completo

// Rules run top to bottom; first match wins. `share` overrides the account default.
// Seeded from the merchants and processing rules already documented in Notion.
export const SEED_RULES = [
  // --- Exclusions (Notion: "Excluir" list) ---
  { match: 'traspaso|transferencia propia|to your |from your |own account|entre cuentas', category: 'excluded', note: 'Transferencia propia' },
  { match: 's&p ?500|sp500|vusa|tesla|invest|etf|savings plan|plan de ahorro', category: 'excluded', note: 'Inversion' },
  { match: 'cashback|interes|interest|remuneracion', category: 'excluded', note: 'Cashback/intereses' },
  { match: 'galicia|inversion oli', category: 'excluded', note: 'Cuenta Juli / Oli' },

  // --- Income ---
  { match: 'animade|revelium|gumroad|substack|stripe|factura|invoice|nomina|paternidad', category: 'income' },

  // --- House & family ---
  { match: 'alquiler|rent|pujades|crismoura|inmobiliaria', category: 'house' },
  { match: 'blau|guarderia|escola|kamalya', category: 'house', share: 0.5 },
  { match: 'lowi|endesa|naturgy|iberdrola|aigues|agbar|luz|gas natural', category: 'house', share: 0.5 },
  { match: 'ikea|mediamarkt|leroy|bricol|mudanza|mudadora', category: 'house' },

  // --- Groceries ---
  { match: 'mercadona|lidl|carrefour|consum|bonpreu|caprabo|dia %|supermercad|aldi|condis|ametller', category: 'groceries' },

  // --- Bars & restaurants ---
  { match: 'glovo|uber ?eats|just ?eat|deliveroo|bar |restaurant|cafe|cafeteria|brunch|pizzer|taberna|vermut', category: 'bars' },

  // --- Taxes / professional ---
  { match: 'seguridad social|tgss|agencia tributaria|aeat|irpf|modelo 130|modelo 303|autonomo', category: 'taxes' },
  { match: 'taxscouts|gestoria|declarando|asesoria|abogad|notari', category: 'professional' },

  // --- Business tools ---
  { match: 'openai|anthropic|claude|github|figma|adobe|notion|vercel|framer|namecheap|godaddy|google workspace|slack|linear|cowork', category: 'biztools' },

  // --- Health ---
  { match: 'adeslas|sanitas|farmacia|dentist|clinic|gimnasio|gym|dir |basic-fit|fisio', category: 'health', share: 0.5 },

  // --- Car / transport ---
  { match: 'cuota auto|seguro coche|gasolin|repsol|cepsa|shell|bp |parking|saba |aparcament|itv|taller|hoyvoy', category: 'car', share: 0.5 },
  { match: 'tmb|renfe|rodalies|bicing|cabify|uber|free ?now|taxi|metro|bus ', category: 'transport' },

  // --- Subscriptions ---
  { match: 'netflix|spotify|disney|hbo|max |apple\\.com|icloud|youtube|amazon prime|filmin|kindle', category: 'subs' },

  // --- Travel ---
  { match: 'airbnb|booking|ryanair|vueling|iberia|easyjet|hotel|hostal|trainline|flixbus|aerolineas', category: 'travel' },

  // --- Entertainment ---
  { match: 'cinema|cines|teatre|teatro|concert|ticketmaster|museu|museo', category: 'entertainment' },

  // --- Amazon: Notion says categorise by context; default to Other for review ---
  { match: 'amazon|amzn', category: 'other', note: 'Amazon — revisar contexto', review: true },
];
