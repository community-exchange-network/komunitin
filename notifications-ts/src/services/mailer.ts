import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export function saveNewsletter(memberCode: string, html: string): void {
  const outputDir = './tmp/newsletters';
  const datetime = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${memberCode}-${datetime}.html`;
  const filepath = path.join(outputDir, filename);
  
  // Ensure directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, html);
  
  logger.info({ filepath, memberCode }, 'Newsletter saved to file (dev mode)');
}

export class Mailer {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (config.SMTP_HOST && config.SMTP_PORT) {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465, // true for 465, false for other ports
        auth: config.SMTP_USER ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        } : undefined,
      });
    }
  }

  public async sendNewsletter(to: string, subject: string, html: string, unsubscribeUrl?: string): Promise<void> {
    if (!this.transporter) {
      logger.warn({ to }, 'SMTP not configured, skipping email send');
      return;
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: config.APP_EMAIL,
      to,
      subject,
      html,
    };

    // Add List-Unsubscribe headers for one-click unsubscribe (RFC 8058)
    if (unsubscribeUrl) {
      mailOptions.headers = {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ messageId: info.messageId, to }, 'Newsletter sent');
    } catch (error) {
      logger.error({ err: error, to }, 'Failed to send newsletter');
      throw error;
    }
  }
}
