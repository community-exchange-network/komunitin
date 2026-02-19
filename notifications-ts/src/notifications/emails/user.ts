import { config } from "../../config";
import { NewsletterTemplateGroup } from "../../newsletter/types";
import { EnrichedEvent, type EnrichedUserEvent } from "../enriched-events";
import { type MessageContext } from "../messages";
import { EmailTemplateContext } from "./types";


type CommonEmailTemplateContext = Pick<EmailTemplateContext, 'appUrl' | 'appName' | 'group' | 'language'>;

const ctxCommon = (event: EnrichedEvent, ctx: MessageContext): CommonEmailTemplateContext => {
  const { t } = ctx;

  const appUrl = config.KOMUNITIN_APP_URL ?? ""
  const appName = t('app_name');

  const group: NewsletterTemplateGroup = {
    name: event.group?.attributes.name ?? appName,
    code: event.group?.attributes.code ?? '',
    initial: '',
    image: event.group?.attributes.image,
  };
  group.initial = (group.code ?? group.name).charAt(0).toUpperCase();

  const data = {
    language: ctx.locale,
    appUrl,
    appName,
    group
  }

  return data
}

export const ctxValidationEmail = (event: EnrichedUserEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;

  const common = ctxCommon(event, ctx);

  const appUrl = common.appUrl;

  // If the event is not associated to any group, this means that the user is
  // validating their email when creating a new group. Otherwise, they are 
  // validating their email to join an existing group.
  const ctaUrl = (event.code) 
    ? `${appUrl}/groups/${event.code}/signup-member?token=${event.token}`
    : `${appUrl}/groups/new?token=${event.token}`;

  const data = {
    ...common,
    subject: t('emails.validate_email_subject', { name: common.group.name }),

    label: {
      icon: '✉️',
      iconBg: '#E0F2FE',
      text: t('emails.validate_email_label'),
    },

    greeting: t('emails.welcome_to', { name: common.group.name }),
    paragraphs: [t('emails.validate_email_text', { name: common.group.name })],

    cta: {
      main: {
        text: t('emails.validate_email_cta'),
        url: ctaUrl
      }
    },

    postscript: t('emails.validate_email_postscript'),
    reason: t('emails.validate_email_reason', { appName: t('app_name') })
  }

  return data

}

export const ctxPasswordReset = (event: EnrichedUserEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const data = {

  } as EmailTemplateContext; // TODO
  return data;
}