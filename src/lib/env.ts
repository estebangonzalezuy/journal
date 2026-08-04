function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/**
 * Getters, no constantes: si esto se evaluara al importar el módulo, un build
 * sin variables configuradas fallaría. Así solo falla la request que la necesita.
 */
export const env = {
  get telegramToken() {
    return required('TELEGRAM_BOT_TOKEN');
  },
  get telegramWebhookSecret() {
    return required('TELEGRAM_WEBHOOK_SECRET');
  },
  get telegramAllowedChatId() {
    return required('TELEGRAM_ALLOWED_CHAT_ID');
  },
  get openaiKey() {
    return required('OPENAI_API_KEY');
  },
  get anthropicKey() {
    return required('ANTHROPIC_API_KEY');
  },
  get anthropicModel() {
    return optional('ANTHROPIC_MODEL', 'claude-opus-5');
  },
  get notionToken() {
    return required('NOTION_TOKEN');
  },
  get notionJournalPageId() {
    return required('NOTION_JOURNAL_PAGE_ID');
  },
  get notionTasksDatabaseId() {
    return required('NOTION_TASKS_DATABASE_ID');
  },
  /** Opcional: id de usuario de Notion para completar Assignee en las tareas. */
  get notionAssigneeUserId() {
    return optional('NOTION_ASSIGNEE_USER_ID');
  },
  get resendKey() {
    return required('RESEND_API_KEY');
  },
  get emailTo() {
    return required('SUMMARY_EMAIL_TO');
  },
  get emailFrom() {
    return optional('SUMMARY_EMAIL_FROM', 'Journal Bot <onboarding@resend.dev>');
  },
  /** Lo setea Vercel automáticamente en los crons cuando está definido. */
  get cronSecret() {
    return optional('CRON_SECRET');
  },
};

export const TIMEZONE = process.env.TIMEZONE || 'Europe/Madrid';
