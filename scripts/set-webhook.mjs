#!/usr/bin/env node
/**
 * Registra (o inspecciona) el webhook de Telegram.
 *
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... APP_URL=https://tu-app.vercel.app \
 *     npm run set-webhook
 *
 *   npm run webhook-info    # ver el estado actual
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.APP_URL;

if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then((response) => response.json());

if (process.argv.includes('--info')) {
  console.log(JSON.stringify(await api('getWebhookInfo'), null, 2));
  process.exit(0);
}

if (!secret || !appUrl) {
  console.error('Faltan TELEGRAM_WEBHOOK_SECRET y/o APP_URL');
  process.exit(1);
}

const url = `${appUrl.replace(/\/$/, '')}/api/journal`;
const result = await api('setWebhook', {
  url,
  secret_token: secret,
  allowed_updates: ['message', 'edited_message', 'callback_query'],
  drop_pending_updates: true,
});

if (!result.ok) {
  console.error('No se pudo registrar el webhook:', result.description);
  process.exit(1);
}

console.log(`Webhook apuntando a ${url}`);
