/**
 * E-posta gonderimi: Brevo (eski adi Sendinblue) HTTP API'si uzerinden.
 *
 * Neden Brevo: ucretsiz katman gunde 300 e-posta, tek dogrulanmis gonderici
 * adresiyle calisir ve ALAN ADI DOGRULAMASI GEREKTIRMEZ. Bu, 0 TL kisitinda
 * (Cloudflare Workers + D1 ucretsiz) onemlidir; Resend/Mailjet gibi
 * saglayicilar alan adi dogrulamasi ister.
 *
 * `BREVO_API_KEY` tanimli DEGILSE gonderim sessizce atlanir (no-op). Boylece
 * gelistirme, testler ve mevcut kurulum etkilenmez; anahtar girildiginde
 * ozellik kendiliginden etkinlesir.
 *
 * Anahtar ayari: `wrangler secret put BREVO_API_KEY`
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface EmailConfig {
  apiKey?: string;
  /** Brevo'da dogrulanmis gonderici adresi (ornek: oyun@ornek.tr). */
  sender?: string;
  senderName?: string;
}

/** Tek bir e-posta gonderir. Anahtar yoksa no-op (skipped). */
export async function sendEmail(config: EmailConfig, message: EmailMessage): Promise<EmailResult> {
  if (!config.apiKey || !config.sender) return { ok: true, skipped: true };
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: config.sender, name: config.senderName ?? "Kul ve Taht" },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        ...(message.text ? { textContent: message.text } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** Basit, markasiz dogrulama e-postasi govdesi (yalnizca Turkce). */
export function verificationEmail(code: string): EmailMessage["html"] {
  const title = "Hesabini dogrula";
  const body = "Asagidaki kodu oyuna girerek hesabini dogrula:";
  return `<h1>${title}</h1><p>${body}</p><p style="font-size:24px;letter-spacing:4px"><b>${code}</b></p>`;
}
