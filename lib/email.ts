/** Envío de mail vía Resend. */

import { required } from "./env";

export async function sendEmail(subject: string, body: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${required("RESEND_API_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: required("SUMMARY_EMAIL_FROM"),
      to: [required("SUMMARY_EMAIL_TO")],
      subject,
      text: body,
      html: toHtml(body),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend falló (${res.status}): ${detail.slice(0, 400)}`);
  }
}

function toHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;max-width:640px;white-space:pre-wrap">${escaped}</div>`;
}
