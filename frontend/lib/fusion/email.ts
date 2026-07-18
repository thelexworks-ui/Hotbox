const FROM = process.env.EMAIL_FROM ?? 'Hotbox <noreply@hotbox-seven.vercel.app>';

export async function sendEmail({ to, subject, html }: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev/staging: emit link to server logs so it can be extracted manually.
    console.log('[email:noop] RESEND_API_KEY not set — would send:');
    console.log(`[email:noop] to=${to} subject=${subject}`);
    console.log(`[email:noop] body=${html}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[email] send failed:', res.status, body);
    throw new Error(`Email delivery failed: ${res.status}`);
  }
}
