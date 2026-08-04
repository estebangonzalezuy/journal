import { env } from './env';

/**
 * Vercel manda `Authorization: Bearer $CRON_SECRET` en los crons cuando la
 * variable está definida. Si no está definida, el endpoint queda abierto:
 * definila siempre en producción.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
