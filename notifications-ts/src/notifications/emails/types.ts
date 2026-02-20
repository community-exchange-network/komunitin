import { NewsletterTemplateGroup } from "../../newsletter/types";
import { TemplateContext } from "../../utils/email-template";


export interface EmailTemplateContext extends TemplateContext {
  appName: string;
  appUrl: string;
  subject: string;
  // header
  group: NewsletterTemplateGroup;
  // label
  label: {
    icon: string;
    iconBg: string;
    text: string;
  };
  // body text
  greeting: string;
  paragraphs: string[];
  // cta
  cta: {
    main: {
      text: string;
      url: string;
    }
  },
  // postscript
  postscript?: string;
  // footer
  reason: string;
  settingsLabel?: string;
  unsubscribeLabel?: string;
  unsubscribeUrl?: string;
}