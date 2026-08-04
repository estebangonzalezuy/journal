import { env } from './env';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toHtml(subject: string, body: string): string {
  const paragraphs = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px">${escapeHtml(line)}</p>`)
    .join('');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<p style="margin:0 0 20px;font-size:13px;color:#8a8a8f;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(subject)}</p>
${paragraphs}
</div>`;
}

export async function sendEmail(subject: string, body: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.resendKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [env.emailTo],
      subject,
      text: body,
      html: toHtml(subject, body),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend falló (${response.status}): ${await response.text()}`);
  }
}
