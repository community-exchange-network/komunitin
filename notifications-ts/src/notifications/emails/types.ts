import { NewsletterTemplateGroup } from "../../newsletter/types";
import { TemplateContext } from "../../utils/email-template";

export interface TransferTemplateMember {
  name: string;
  code: string;
  image?: string;
  initial: string;
  group?: {
    name: string;
    image?: string;
    initial: string;
  };
}

export interface TransferTemplateContext {
  description: string;
  amount: string;
  amountColor: string;
  otherAmount?: string;
  payer: TransferTemplateMember;
  payee: TransferTemplateMember;
  date: string;
  status: {
    label: string;
    color: string;
    bgColor: string;
  };
}

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
  // transfer card (optional)
  transfer?: TransferTemplateContext;
  // balance line (optional, shown after CTA)
  balanceLine?: {
    html: string;
  };
  // postscript
  postscript?: string;
  // footer
  reason: string;
  settingsLabel?: string;
  unsubscribeLabel?: string;
  unsubscribeUrl?: string;
}