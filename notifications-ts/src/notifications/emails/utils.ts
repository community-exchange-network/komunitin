import type { AnyEnrichedEvent } from "../enriched-events";
import type { MessageContext } from "../messages";
import type { EmailTemplateContext } from "./types";
import { config } from "../../config";
import type { NewsletterTemplateGroup } from "../../newsletter/types";

type CommonEmailTemplateContext = Pick<EmailTemplateContext, 'appUrl' | 'appName' | 'group' | 'language' | 'reason' | 'settingsLabel'>;

export const ctxCommon = (event: AnyEnrichedEvent, ctx: MessageContext): CommonEmailTemplateContext => {
  const { t } = ctx;

  const appUrl = config.KOMUNITIN_APP_URL ?? ""
  const appName = t('app_name');

  const name = event.group?.attributes.name ?? appName;
  const code = event.group?.attributes.code ?? '';
  const initial = (code ? code : appName).charAt(0).toUpperCase();

  const group: NewsletterTemplateGroup = {
    name,
    code,
    initial,
    image: event.group?.attributes.image,
  };

  const data = {
    language: ctx.locale,
    appUrl,
    appName,
    group,
    // Rendered through {{{reason}}} in templates/partials/footer.hbs.
    reason: t('emails.reason_active_member', {
      groupName: group.name,
      appName,
      interpolation: { escapeValue: true },
    }),
    settingsLabel: t('emails.settings'),
  }

  return data
}