/**
 * Autorización de los endpoints de cron.
 *
 * Vercel Cron manda `Authorization: Bearer $CRON_SECRET` en cada disparo. Si
 * CRON_SECRET no está definido, el endpoint queda abierto: definilo siempre en
 * producción.
 */

import { optional } from "./env";

export function isAuthorizedCron(request: Request): boolean {
  const secret = optional("CRON_SECRET");
  if (!secret) return true;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  // Permite disparar el resumen a mano desde el navegador para probar.
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}
