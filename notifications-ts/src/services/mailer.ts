import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../utils/logger';

export class Mailer {
  private transporter: nodemailer.Transporter;

  constructor() {
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

  public async sendNewsletter(to: string, subject: string, html: string): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: config.SMTP_FROM,
        to,
        subject,
        html,
      });
      logger.info({ messageId: info.messageId, to }, 'Newsletter sent');
    } catch (error) {
      logger.error({ err: error, to }, 'Failed to send newsletter');
      throw error;
    }
  }
}
