import initI18n from "../../../utils/i18n";
import { AnyEnrichedEvent } from "../../enriched-events";
import { MessageContext } from "../../messages";
import { Mailer } from "../../../clients/email/mailer";
import { EmailTemplateContext } from "../../emails/types";
import { renderTemplate } from "../../../utils/email-template";
import { config } from "../../../config";
import logger from "../../../utils/logger";
import type { Recipient } from "../../../clients/komunitin/types";

const mailer = new Mailer();

export type EmailMessage = {
  subject: string;
  html: string;
};

const buildAndSendEmail = async <T extends AnyEnrichedEvent>(
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

export type EmailPolicy = 'account' | 'mandatory';

export const handleEmailEvent = async <T extends AnyEnrichedEvent>(
  event: T,
  recipients: Recipient[],
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null,
  policy: EmailPolicy,
) => {
  const uniqueRecipients = new Map(recipients.map((recipient) => [recipient.user.id, recipient]));

  for (const recipient of uniqueRecipients.values()) {
    if (policy === 'account' && recipient.memberUser?.attributes.emails.myAccount !== true) {
      continue;
    }
    const { user } = recipient;
    const locale = user.attributes.language || 'en';
    await buildAndSendEmail(event, user.attributes.email, locale, templateName, buildContext);
  }
}

export const handleEmailAddressEvent = async <T extends AnyEnrichedEvent>(
  event: T,
  to: string,
  locale: string | undefined,
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null) => {
  await buildAndSendEmail(event, to, locale ?? 'en', templateName, buildContext)
}

/**
 * Send an email to the server superadmin (ADMIN_EMAIL env var), always in English.
 * Used for system-level events like GroupRequested that are not tied to a specific user.
 */
export const handleSuperadminEmailEvent = async <T extends AnyEnrichedEvent>(
  event: T,
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null) => {
  const adminEmail = config.ADMIN_EMAIL;
  await buildAndSendEmail(event, adminEmail, 'en', templateName, buildContext);
}
