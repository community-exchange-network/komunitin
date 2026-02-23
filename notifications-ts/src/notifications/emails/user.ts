import { type EnrichedUserEvent } from "../enriched-events";
import { type MessageContext } from "../messages";
import { EmailTemplateContext } from "./types";
import { ctxCommon } from "./utils";

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

    postscript: t('emails.safely_ignore'),
    reason: t('emails.validate_email_reason', { appName: t('app_name') })
  }

  return data

}

export const ctxPasswordReset = (event: EnrichedUserEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);
  
  const data = {
    ...common,
    subject: t('emails.reset_password_subject', { name: common.group.name }),
    
    label: {
      icon: '🔑',
      iconBg: '#FEF3C7',
      text: t('emails.reset_password_label'),
    },
    
    greeting: t('emails.hello'),
    paragraphs: [t('emails.reset_password_text', { name: common.group.name })],
    
    cta: {
      main: {
        text: t('emails.reset_password_cta'),
        url: `${common.appUrl}/set-password?token=${event.token}`
      }
    },

    postscript: t('emails.safely_ignore'),
    reason: t('emails.reset_password_reason', { appName: t('app_name') })

  } as EmailTemplateContext;
  return data;
}