import type { EnrichedGroupEvent } from "../enriched-events";
import type { MessageContext } from "../messages";
import type { EmailTemplateContext } from "./types";
import { ctxCommon } from "./utils";
export const ctxGroupActivatedEmail = (event: EnrichedGroupEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);
  const groupName = common.group.name;

  return {
    ...common,
    subject: t('emails.group_activated_subject', { groupName }),

    label: {
      icon: '🎉',
      iconBg: '#E8F5E9',
      text: t('emails.group_activated_label'),
    },

    greeting: t('emails.hello_admin'),
    paragraphs: [
      t('emails.group_activated_text', { groupName }),
      t('emails.group_activated_subtext', { appName: common.appName }),
    ],

    cta: {
      main: {
        text: t('emails.group_activated_cta'),
        url: `${common.appUrl}/groups/${common.group.code}/admin`
      }
    },
    reason: t('emails.reason_admin', { groupName, appName: common.appName }),
  };
};

export const ctxGroupRequestedEmail = (event: EnrichedGroupEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);
  const groupName = common.group.name;
  const adminUrl = `${common.appUrl}/superadmin/groups`;

  return {
    ...common,
    subject: t('emails.group_requested_subject', { groupName }),

    label: {
      icon: '🚀',
      iconBg: '#FFF3E0',
      text: t('emails.group_requested_label'),
    },

    greeting: t('emails.hello_admin'),
    paragraphs: [
      t('emails.group_requested_text', { groupName }),
      t('emails.group_requested_subtext'),
    ],

    cta: {
      main: {
        text: t('emails.group_requested_cta'),
        url: adminUrl,
      }
    },
    reason: t('emails.reason_superadmin', { appName: common.appName }),
  };
};
