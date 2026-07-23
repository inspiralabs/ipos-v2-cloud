// Kirim langsung via REST API Resend — skip SDK `resend` npm, cuma butuh 1 endpoint.
export async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Inspira POS <noreply@inspiralabs.id>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(new Error(`Resend gagal kirim email: ${body}`), { statusCode: 502, code: 'EMAIL_SEND_FAILED' });
  }
  return res.json();
}

// {{var}} sederhana — cukup untuk template internal, tidak perlu template engine.
export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
