import type { EnrichedEvent } from "../enriched-events";
import type { MessageContext } from "../messages";
import type { EmailTemplateContext } from "./types";
import { config } from "../../config";
import type { NewsletterTemplateGroup } from "../../newsletter/types";

type CommonEmailTemplateContext = Pick<EmailTemplateContext, 'appUrl' | 'appName' | 'group' | 'language' | 'reason'>;

export const ctxCommon = (event: EnrichedEvent, ctx: MessageContext): CommonEmailTemplateContext => {
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
    group,
    reason: t('emails.reason_active_member', {groupName: group.name, appName})
  }

  return data
}