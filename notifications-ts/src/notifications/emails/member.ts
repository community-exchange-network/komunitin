import type { EnrichedMemberEvent } from "../enriched-events";
import type { MessageContext } from "../messages";
import type { EmailTemplateContext } from "./types";
import { ctxCommon } from "./utils";

export const ctxWelcomeEmail = (event: EnrichedMemberEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);

  const memberName = event.member.attributes.name

  const data = {
    ...common,
    subject: t('emails.welcome_subject', { name: common.group.name }),

    label: {
      icon: '👋',
      iconBg: '#D1FAE5',
      text: t('emails.welcome_label'),
    },

    greeting: t('emails.hello_name', { name: memberName }),
    paragraphs: [
      t('emails.welcome_text_1', { groupName: common.group.name, code: event.member.attributes.code }),
      t('emails.welcome_text_2', { appName: common.appName}),
      t('emails.happy_exchange')
    ],
    
    cta: {
      main: {
        text: t('emails.welcome_cta_main'),
        url: `${common.appUrl}/home`
      },
      secondary: {
        text: t('emails.welcome_cta_secondary'),
        url: `${common.appUrl}/groups/${common.group.code}`
      }
    },
  }

  return data
}