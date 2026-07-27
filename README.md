# Journal

Journal automatizado: mandás audios o texto por Telegram durante el día, el sistema
transcribe, redacta la entrada en tu voz, la guarda en Notion, y te propone las tareas
puntuales que detectó antes de crearlas. Dos resúmenes por mail: uno diario y uno semanal.

```
Telegram ──► /api/journal ──► Whisper ──► Claude ──► Notion (Journal → página "D/M")
                  │                          └─────► tareas detectadas
                  └──► propone por Telegram ──► confirmás ──► Notion (base "Tareas")

Vercel Cron ─► /api/daily-summary  (21:00 todos los días) ─► Claude ─► Resend ─► mail
Vercel Cron ─► /api/weekly-summary (domingos 20:00)       ─► Claude ─► Resend ─► mail
```

---

## Lo que necesito de vos

Esto es lo único que no puedo hacer solo. El orden importa poco salvo el último punto.

### 1. Bot de Telegram

1. Abrí [@BotFather](https://t.me/BotFather) → `/newbot` → nombre y username.
2. Guardá el token que te da → `TELEGRAM_BOT_TOKEN`.
3. Escribile algo a tu bot nuevo y abrí [@userinfobot](https://t.me/userinfobot) para saber
   tu chat id → `TELEGRAM_CHAT_ID`. Sin esto el bot le responde a cualquiera que lo encuentre.
4. Inventá un secreto para el webhook: `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`.

### 2. Notion

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**,
   tipo *Internal*. Copiá el *Internal Integration Secret* → `NOTION_TOKEN`.
2. Abrí tu página **Journal** → menú `···` → **Connections** → agregá la integración.
   Copiá el ID de la URL → `NOTION_JOURNAL_PAGE_ID`.
   En `notion.so/Journal-8a1b2c3...?v=...` el ID son los 32 caracteres finales del slug.
3. Hacé lo mismo con la base **Tareas** → `NOTION_TASKS_DB_ID`.
4. Opcional: si querés que las tareas queden asignadas a vos, pasame tu user id de Notion
   → `NOTION_ASSIGNEE_USER_ID`. Si no lo ponés, la propiedad *Assignee* queda vacía.

> El código lee el schema real de la base *Tareas* en cada arranque en frío y escribe solo
> las propiedades que existen. Si renombrás *Deadline* o agregás columnas, no se rompe.

### 3. API keys

- OpenAI (Whisper): [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → `OPENAI_API_KEY`
- Anthropic (Claude): [console.anthropic.com](https://console.anthropic.com/settings/keys) → `ANTHROPIC_API_KEY`
- Resend (mail): [resend.com/api-keys](https://resend.com/api-keys) → `RESEND_API_KEY`
  - Verificá un dominio en Resend y usalo en `SUMMARY_EMAIL_FROM`.
    Para probar sin dominio propio: `onboarding@resend.dev`.

### 4. Vercel

1. Importá este repo en [vercel.com/new](https://vercel.com/new). Detecta Next.js solo.
2. Pegá todas las variables de `.env.example` en **Settings → Environment Variables**
   (marcá Production **y** Preview).
3. Generá `CRON_SECRET` con `openssl rand -hex 32` y agregalo también. Sin él, cualquiera
   que sepa la URL puede disparar los resúmenes.
4. Deploy.
5. Registrá el webhook de Telegram apuntando al dominio del deploy:

   ```bash
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
     npm run set-webhook -- https://tu-proyecto.vercel.app
   ```

   Para verificar: `npm run set-webhook -- --info`

---

## Probar que funciona

```bash
# Configuración mínima del webhook
curl https://tu-proyecto.vercel.app/api/journal

# Resumen diario a mano (sin esperar al cron)
curl "https://tu-proyecto.vercel.app/api/daily-summary?secret=$CRON_SECRET"

# Resumen de un día concreto
curl "https://tu-proyecto.vercel.app/api/daily-summary?secret=$CRON_SECRET&date=2026-07-27"

# Resumen semanal
curl "https://tu-proyecto.vercel.app/api/weekly-summary?secret=$CRON_SECRET"
```

Y por Telegram: mandale `/help` al bot, después un audio de prueba tipo
*"Hoy cerramos la animación del spot. El jueves a las diez tengo call con el cliente."*
Debería anotar la entrada y proponerte la call del jueves.

---

## Decisiones que vale la pena conocer

**Las tareas propuestas no se guardan en ningún lado.** Vercel Hobby no trae base de datos y
meter Redis solo para esto era una cuenta y una key más. La fecha ISO de cada tarea viaja
dentro del mensaje de Telegram (esa línea `#2026-07-31T10:00`); cuando apretás el botón,
Telegram nos devuelve el mensaje original y lo volvemos a parsear. Cero infraestructura y
cero estado huérfano. El costo: cada propuesta admite **una** decisión — confirmás una,
todas, o ninguna. Si detectó tres y solo querés la segunda, apretás "Solo la 2" y las otras
se descartan.

**El filtro de días laborales está en dos capas.** Se lo pido a Claude en el prompt, pero
además se revalida en código antes de proponer nada (`lib/claude.ts`). Un fin de semana no
se cuela ni aunque el modelo se distraiga.

**Zona horaria resuelta a mano, sin dependencias.** `lib/time.ts` calcula el offset real de
Europe/Madrid para cada fecha, así que un deadline del 25 de octubre a las 05:00 se guarda
como `+01:00` y uno del mismo día a la 01:00 como `+02:00`. Está testeado contra los dos
cambios de horario de 2026.

**`Estimated` se escribe en minutos**, si la propiedad existe y es numérica. Si en tu base
está pensada en horas, decímelo y lo cambio.

**Modelo**: `claude-opus-5` con `effort: "low"` — rápido y barato para tareas de este
tamaño. Se cambia con `CLAUDE_MODEL` sin tocar código.

---

## Límites del plan Hobby de Vercel

- **Crons: una ejecución por día como máximo, con hasta ±59 min de imprecisión.** Alcanza
  justo para los dos resúmenes. No metas nada más frecuente ahí.
- Los horarios en `vercel.json` están en **UTC**: `0 19 * * *` es 21:00 en Madrid con
  horario de verano (20:00 en invierno). Si te molesta el corrimiento, ajustá el cron dos
  veces al año.
- El webhook de Telegram no pasa por cron: responde en tiempo real, sin esas restricciones.
- Timeout de función: 60s. Un audio largo (transcripción + redacción + escritura en Notion)
  ronda los 15-30s.

---

## Estructura

```
app/
  api/journal/route.ts          webhook de Telegram: captura + confirmación de tareas
  api/daily-summary/route.ts    cron diario
  api/weekly-summary/route.ts   cron semanal
lib/
  claude.ts       prompts (voz, extracción de tareas, resúmenes)
  notion.ts       páginas del journal + base de tareas
  telegram.ts     cliente de la Bot API
  transcribe.ts   Whisper
  email.ts        Resend
  proposals.ts    render y parseo de las propuestas de tarea
  time.ts         fechas y zona horaria
  cron.ts         autorización de los endpoints de cron
  env.ts          variables de entorno
scripts/set-webhook.mjs
```

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completá las variables
npm run dev
npm run typecheck
```

Para probar el webhook en local necesitás una URL pública (`ngrok http 3000`) y registrarla
con `npm run set-webhook -- https://xxxx.ngrok.app`. Acordate de volver a apuntarlo a Vercel
cuando termines.
