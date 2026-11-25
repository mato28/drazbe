import { type Mailer } from '@domik/core';
import { type WorkerConfig } from '@domik/shared/config';
import nodemailer from 'nodemailer';

export function createSmtpMailer(config: WorkerConfig): Mailer & { close: () => void } {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } }
      : {}),
  });
  return {
    async send(email) {
      await transport.sendMail({
        from: config.MAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    },
    close: () => {
      transport.close();
    },
  };
}
