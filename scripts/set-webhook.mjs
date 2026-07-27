#!/usr/bin/env node
/**
 * Registra (o consulta) el webhook del bot de Telegram.
 *
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   node scripts/set-webhook.mjs https://tu-proyecto.vercel.app
 *
 *   node scripts/set-webhook.mjs --info     # ver el webhook actual
 *   node scripts/set-webhook.mjs --delete   # borrarlo
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Falta TELEGRAM_BOT_TOKEN en el entorno.");
  process.exit(1);
}

const api = (method, payload) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  }).then((r) => r.json());

const arg = process.argv[2];

if (arg === "--info") {
  console.log(JSON.stringify(await api("getWebhookInfo"), null, 2));
  process.exit(0);
}

if (arg === "--delete") {
  console.log(JSON.stringify(await api("deleteWebhook", { drop_pending_updates: true }), null, 2));
  process.exit(0);
}

if (!arg) {
  console.error("Uso: node scripts/set-webhook.mjs https://tu-proyecto.vercel.app");
  process.exit(1);
}

const base = arg.replace(/\/+$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) {
  console.warn("⚠️  Sin TELEGRAM_WEBHOOK_SECRET: el webhook quedará sin verificación de origen.");
}

const result = await api("setWebhook", {
  url: `${base}/api/journal`,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
  ...(secret ? { secret_token: secret } : {}),
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
console.log(`\n✅ Webhook apuntando a ${base}/api/journal`);
