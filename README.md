# Journal Bot

Mandás audios o texto por Telegram durante el día. El sistema transcribe, redacta la entrada en tu voz, la guarda en Notion, te propone las tareas que detectó antes de crearlas, y te manda un resumen por mail cada día y cada domingo.

```
Telegram ──▶ /api/journal ──▶ Whisper ──▶ Claude ──┬──▶ Notion · Journal · página "D/M"
                                                   └──▶ propuesta de tarea ──▶ (confirmás) ──▶ Notion · Tareas

cron 19:00 UTC      ──▶ /api/daily-summary   ──▶ Claude ──▶ Resend
cron dom 18:00 UTC  ──▶ /api/weekly-summary  ──▶ Claude ──▶ Resend
```

## Stack

Next.js (App Router) en Vercel Hobby · Bot de Telegram · Whisper (OpenAI) · Claude (Anthropic) · Notion API · Resend.

Sin base de datos: todo el estado vive en Notion, y las propuestas de tarea pendientes viajan dentro del propio mensaje de Telegram (ver *Decisiones de diseño*).

## Puesta en marcha

### 1. Cuentas y tokens

| Qué | Dónde | Variable |
| --- | --- | --- |
| Bot de Telegram | [@BotFather](https://t.me/botfather) → `/newbot` | `TELEGRAM_BOT_TOKEN` |
| Tu chat id | escribile al bot y abrí `https://api.telegram.org/bot<TOKEN>/getUpdates` | `TELEGRAM_ALLOWED_CHAT_ID` |
| Secreto del webhook | lo inventás vos: `openssl rand -hex 32` | `TELEGRAM_WEBHOOK_SECRET` |
| Integration de Notion | [notion.so/my-integrations](https://www.notion.so/my-integrations) | `NOTION_TOKEN` |
| API key de OpenAI | [platform.openai.com](https://platform.openai.com) | `OPENAI_API_KEY` |
| API key de Anthropic | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_API_KEY` |
| API key de Resend | [resend.com](https://resend.com) | `RESEND_API_KEY` |

**Importante en Notion:** después de crear la integration, entrá a la página **Journal** y a la base **Tareas**, y en `⋯ → Conexiones → Conectar a` elegí la integration. Sin eso la API no las ve, aunque el token sea válido.

Los ids salen de las URLs:

- Página Journal: `notion.so/Journal-`**`1f2e3d4c5b6a7890abcd1234ef567890`** → `NOTION_JOURNAL_PAGE_ID`
- Base Tareas: `notion.so/`**`abcdef1234567890abcdef1234567890`**`?v=...` → `NOTION_TASKS_DATABASE_ID`

### 2. Local

```bash
cp .env.example .env.local   # y completá los valores
npm install
npm run dev
```

### 3. Deploy

```bash
npx vercel link
npx vercel env add TELEGRAM_BOT_TOKEN     # ...y el resto de las variables
npx vercel --prod
```

O conectá el repo desde el dashboard de Vercel y cargá las variables ahí. Los dos crons de `vercel.json` se registran solos en el primer deploy a producción.

### 4. Registrar el webhook

Con la app ya deployada:

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... APP_URL=https://tu-app.vercel.app \
  npm run set-webhook

npm run webhook-info    # verificar
```

### 5. Probar

1. Mandale un audio al bot con una tarea adentro: *"hoy avancé con el cut de Reboot; el martes a las 10 tengo que llamar a Marina"*.
2. En unos segundos: `📓 Guardado en 4/8` y, aparte, la propuesta de tarea con botones.
3. Revisá la página del día en Notion.
4. Tocá **✅ Crear** y fijate que aparezca en la base Tareas con el Deadline puesto.
5. Los resúmenes llegan solos; para probarlos ya:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tu-app.vercel.app/api/daily-summary
```

## Horarios

Los crons de Vercel corren en UTC y no aceptan zona horaria, así que quedan fijos:

| Cron | UTC | Barcelona (verano) | Barcelona (invierno) |
| --- | --- | --- | --- |
| Diario | 19:00 | 21:00 | 20:00 |
| Semanal (domingo) | 18:00 | 20:00 | 19:00 |

En Hobby hay hasta ±59 min de imprecisión y máximo una corrida por día por cron. Si te molesta el corrimiento de invierno, cambiá el `schedule` en `vercel.json` a `0 20 * * *` en octubre.

## Decisiones de diseño

**Las tareas pendientes no se guardan en ningún lado.** Vercel es stateless y Hobby no trae base de datos. En vez de sumar un KV, la propuesta se escribe en el mensaje de Telegram con formato fijo (`Nombre:` / `Deadline:` / `Estimado:`) y se vuelve a leer desde `callback_query.message.text` cuando confirmás. Cero infraestructura, y ves exactamente lo que se va a crear. El costo: si editás a mano el mensaje del bot, deja de parsearse.

**El schema de la base Tareas se lee en runtime.** `createTask` hace un `GET /databases/{id}` y mapea las propiedades por nombre y por tipo, así que funciona igual si `Status` es `status` o `select`, y si `Estimated` es número (guarda minutos) o texto (guarda el string tal cual). Lo que no encuentra, lo omite en lugar de fallar.

**`Status` no se setea por defecto.** Los nombres de las opciones varían entre bases y un valor inválido rompe el `POST`. Si querés un estado inicial, poné el nombre exacto en `NOTION_TASK_STATUS`.

**Doble filtro de días laborales.** Se lo pedimos a Claude en el prompt *y* se vuelve a chequear en el servidor (`isWeekday`), porque el modelo puede resolver mal un "el martes que viene".

**El webhook siempre responde 200.** Si devolviera error, Telegram reintentaría el mismo update y terminarías con la entrada duplicada en Notion. Los errores se loguean y te llegan por Telegram.

**Dos capas de seguridad en el webhook.** Se valida el header `x-telegram-bot-api-secret-token` y además que el `chat.id` sea el tuyo. Lo que venga de otro chat se descarta en silencio.

## Estructura

```
src/app/api/journal/route.ts          webhook de Telegram (mensajes + botones)
src/app/api/daily-summary/route.ts    cron diario
src/app/api/weekly-summary/route.ts   cron semanal
src/lib/claude.ts                     redacción de entradas, detección de tareas, resúmenes
src/lib/notion.ts                     páginas del día, append de entradas, creación de tareas
src/lib/telegram.ts                   cliente del Bot API
src/lib/transcribe.ts                 Whisper
src/lib/email.ts                      Resend
src/lib/tasks.ts                      formato y parseo de las propuestas de tarea
src/lib/dates.ts                      zona horaria y formato "D/M"
scripts/set-webhook.mjs               registrar / inspeccionar el webhook
```

## Costo

Vercel Hobby, Resend (3.000 mails/mes) y la API de Notion son gratis con este uso. Pagás Whisper (~USD 0,006 por minuto de audio) y Claude por entrada y por resumen. Con uso personal, unos pocos dólares al mes.
