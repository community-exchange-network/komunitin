import { Account, Group, Currency, Member } from '../clients/komunitin/types';
export interface Stats {
  exchanges: number;
  newMembers: number;
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
