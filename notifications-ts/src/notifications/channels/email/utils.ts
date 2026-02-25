import initI18n from "../../../utils/i18n";
import { EnrichedEvent } from "../../enriched-events";
import { MessageContext } from "../../messages";
import { EmailOptions, Mailer } from "../../../clients/email/mailer";
import { EmailTemplateContext } from "../../emails/types";
import { renderTemplate } from "../../../utils/email-template";

const mailer = new Mailer();

export type EmailMessage = {
  subject: string;
  html: string;
};

export const handleEmailEvent = async <T extends EnrichedEvent>(
  event: T,
  users: Array<{ user: any; settings: any }>,
  templateName: string,
  buildContext: (event: T, ctx: MessageContext) => EmailTemplateContext | null) => {
  const i18n = await initI18n();
  
  for (const { user, settings } of users) {
    const locale = settings.attributes.language || 'en';
    const t = i18n.getFixedT(locale);

    const context = buildContext(event, { t, locale });
    if (context) {
      const html = await renderTemplate(templateName, context);
      const email: EmailOptions = {
        to: user.attributes.email,
        subject: context.subject,
        html
      }
      await mailer.sendEmail(email);
    }
  }
}


