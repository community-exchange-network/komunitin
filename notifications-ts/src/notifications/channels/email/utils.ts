import initI18n from "../../../utils/i18n";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext } from "../../messages";
import { Mailer } from "../../../clients/email/mailer";
import { EmailTemplateContext } from "../../emails/types";
import { renderTemplate } from "../../../utils/email-template";
import { config } from "../../../config";
import logger from "../../../utils/logger";

const mailer = new Mailer();

export type EmailMessage = {
  subject: string;
  html: string;
};

const buildAndSendEmail = async <T extends EnrichedEvent>(
  event: T,
  to: string,
  locale: string,
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null) => {
  const i18n = await initI18n();
  const t = i18n.getFixedT(locale);
  const context = buildContext(event, { t, locale });
  if (context) {
    const html = await renderTemplate(templateName, context);
    await mailer.sendEmail({ to, subject: context.subject, html });
  }
}

export const handleEmailEvent = async <T extends EnrichedEvent>(
  event: T,
  users: Array<{ user: any; settings: any }>,
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null) => {
  for (const { user, settings } of users) {
    const locale = settings.attributes.language || 'en';
    await buildAndSendEmail(event, user.attributes.email, locale, templateName, buildContext);
  }
}

/**
 * Send an email to the server superadmin (ADMIN_EMAIL env var), always in English.
 * Used for system-level events like GroupRequested that are not tied to a specific user.
 */
export const handleSuperadminEmailEvent = async <T extends EnrichedEvent>(
  event: T,
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null) => {
  const adminEmail = config.ADMIN_EMAIL;
  if (!adminEmail) {
    logger.warn({ event: event.name }, 'ADMIN_EMAIL not configured, skipping superadmin email');
    return;
  }
  await buildAndSendEmail(event, adminEmail, 'en', templateName, buildContext);
}


