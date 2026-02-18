import { Account, Group, Currency, Member } from '../clients/komunitin/types';
import { TemplateContext } from '../utils/email-template';
export interface Stats {
  exchanges: number;
  activeAccounts: number;
  newMembers: number;
}

export interface NewsletterTemplateAlert {
  title: string;
  text: string;
  actionText: string;
  actionUrl: string;
  type: string;
}

export interface NewsletterTemplateItem extends ProcessedItem {
  title: string;
  description: string;
  authorDisplayName: string;
  distanceLabel?: string;
}

export interface NewsletterTemplateContext extends TemplateContext {
  unsubscribeUrl?: string;
  appUrl: string;
  group: Group;
  member: Member;
  subject: string;
  greetingName: string;
  formattedBalance: string;
  balanceAdvice: string;
  activitySummary: string | null;
  accountAlert: NewsletterTemplateAlert | null;
  groupNameInitial: string;
  bestOffers: NewsletterTemplateItem[];
  bestNeeds: NewsletterTemplateItem[];
  stats: Stats;
}

export interface AccountAlert {
  type: string;
  titleId: string;
  textId: string;
  messageParams?: Record<string, any>;
  actionUrl: string;
  actionTextId: string;
}

export interface AccountSection {
  balance: number;
  activityCount?: number;
  balanceAdviceId?: string;
  alert?: AccountAlert;
}

export interface ProcessedItem {
  id: string;
  code: string;
  title?: string;
  description: string;
  image?: string;
  author: {
    name: string;
    image?: string;
  };
  distance?: number;
  category?: string;
  link: string; // Useful for template
}

export interface NewsletterContext {
  group: Group;
  member: Member;
  recipient: {
    userId: string;
    email: string;
    language: string;
    unsubscribeToken?: string;
  }
  account: Account;
  currency: Currency;
  bestOffers: ProcessedItem[];
  bestNeeds: ProcessedItem[];
  stats: Stats;
  accountSection?: AccountSection;
  appUrl: string;
}



export interface LogContent {
  bestOffers?: string[];
  bestNeeds?: string[];
  stats?: Stats;
  account?: {
    balance: number;
    activityCount?: number;
    alert?: string; //alert type
  };
}

export interface HistoryLog {
  memberId: string;
  tenantId: string;
  sentAt: Date;
  content: LogContent;
  recipients: unknown;
}
