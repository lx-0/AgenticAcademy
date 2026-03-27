import { Resend } from "resend";
import { db } from "@agentic-academy/db";
import type { EmailType } from "@agentic-academy/db";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

const resendClient = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "AgenticAcademy <noreply@agentic.academy>";

interface SendEmailOptions {
  to: string;
  subject: string;
  template: ReactElement;
  type: EmailType;
  userId?: string;
}

/**
 * Send a transactional email via Resend.
 * Logs the result to EmailLog. Fails silently — never throws into callers.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const { to, subject, template, type, userId } = opts;

  let status = "sent";
  let error: string | undefined;

  try {
    if (!resendClient) {
      // Dev/no-config: log to console so developers can see email content
      const html = await render(template);
      console.log(`[email] ${type} → ${to}\nSubject: ${subject}\n${html.slice(0, 200)}…`);
    } else {
      const html = await render(template);
      const result = await resendClient.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      if (result.error) {
        status = "failed";
        error = result.error.message;
      }
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send ${type} to ${to}:`, error);
  }

  // Log to DB (fire-and-forget — don't await the insert in callers)
  db.emailLog
    .create({ data: { userId, email: to, type, subject, status, error } })
    .catch(() => {});
}
