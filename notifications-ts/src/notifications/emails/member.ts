import type { EnrichedMemberEvent, EnrichedMemberRequestedEvent } from "../enriched-events";
import type { MessageContext } from "../messages";
import type { EmailTemplateContext } from "./types";
import { ctxCommon } from "./utils";

export const ctxMemberRequestedEmail = (event: EnrichedMemberRequestedEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);

  const memberName = event.member.attributes.name;
  const memberEmail = event.users[0]?.user.attributes.email ?? '';
  const memberTown = event.member.attributes.address?.addressLocality ?? '';

  // Build member details paragraph with available info
  const detailLines = [
    `<strong>${t('emails.member_requested_detail_name')}</strong> ${memberName}`,
    `<strong>${t('emails.member_requested_detail_email')}</strong> ${memberEmail}`,
  ];
  if (memberTown) {
    detailLines.push(`<strong>${t('emails.member_requested_detail_town')}</strong> ${memberTown}`);
  }
  const detailsParagraph = detailLines.join('<br/>');

  return {
    ...common,
    subject: t('emails.member_requested_subject', { groupName: common.group.name }),

    label: {
      icon: '🙋',
      iconBg: '#E1F5FE',
      text: t('emails.member_requested_label'),
    },

    greeting: t('emails.hello_admin'),
    paragraphs: [
      t('emails.member_requested_text', { memberName, groupName: common.group.name }),
      detailsParagraph,
      t('emails.member_requested_subtext'),
    ],

    cta: {
      main: {
        text: t('emails.member_requested_cta'),
        url: `${common.appUrl}/groups/${common.group.code}/admin/accounts`
      }
    },
    reason: t('emails.reason_admin', { groupName: common.group.name, appName: common.appName }),
  };
};

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