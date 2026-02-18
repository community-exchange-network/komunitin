import nodemailer from 'nodemailer';
import { config } from '../../config';
import logger from '../../utils/logger';
import { convert as htmlToText } from 'html-to-text';
import * as fs from 'fs';
import * as path from 'path';

function saveEmail(message: EmailOptions): void {
  const outputDir = './tmp/emails';
  const datetime = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${message.to}-${datetime}.html`;
  const filepath = path.join(outputDir, filename);
  
  // Ensure directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, message.html);
  
  logger.info({ filepath, to: message.to }, 'Email saved to file (dev mode)');
}

export type EmailOptions = {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  token?: string;
};


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

  /**
   * Sends an email using the configured SMTP transporter. 
   * 
   * If DEV_SAVE_NEWSLETTERS is enabled, the email content will also be saved to a local file.
   * If SMTP is not configured, the method will log a warning and skip sending the email.
   * If a token is provided, List-Unsubscribe headers will be added for one-click unsubscribe functionality.
   * If text is not provided, it will be auto-generated from the HTML content.
   * 
   * @param message 
   * @returns 
   */
  public async sendEmail(message: EmailOptions): Promise<void> {
    if (config.DEV_SAVE_NEWSLETTERS) {
      saveEmail(message);
    }
    
    if (!this.transporter) {
      logger.warn({ to: message.to }, 'SMTP not configured, skipping email send');
      return;
    }

    const text = message.text ?? htmlToText(message.html);
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: config.APP_EMAIL,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text,
    };

    // Add List-Unsubscribe headers for one-click unsubscribe (RFC 8058)
    if (message.token) {
      const unsubscribeUrl = `${config.KOMUNITIN_SOCIAL_PUBLIC_URL}/users/me/unsubscribe?token=${message.token}`;
      mailOptions.headers = {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ messageId: info.messageId, to: message.to }, 'Email sent');
    } catch (error) {
      logger.error({ err: error, to: message.to }, 'Failed to send email');
      throw error;
    }
  }
}
