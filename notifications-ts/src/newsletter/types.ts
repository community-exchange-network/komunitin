export interface Offer {
  id: string;
  attributes: {
    name: string;
    description: string;
    created: string;
    expires?: string;
    // add other fields
  };
  relationships: {
    author: { data: { id: string } }
  }
}

export interface Need {
  id: string;
  attributes: {
    name: string;
    description: string;
    created: string;
    expires?: string;
  };
  relationships: {
    author: { data: { id: string } }
  }
}

export interface Stats {
  exchanges: number;
  newMembers: number;
}

export interface AccountAlert {
  type: string;
  message: string;
  actionUrl: string;
  actionText: string;
}

export interface AccountSection {
  balanceText: string;
  activityText?: string;
  balanceAdvice?: string;
  alert?: AccountAlert;
}

export interface NewsletterContext {
  group: any;
  member: any;
  user: any;
  account: any;
  bestOffers: Offer[];
  bestNeeds: Need[];
  oldOffers: Offer[];
  stats: Stats;
  accountSection?: AccountSection;
}

export interface Member {
  id: string;
  attributes: {
    latitude?: number;
    longitude?: number;
    [key: string]: any;
  };
  relationships?: any;
}

export interface LogContent {
  bestOffers?: string[];
  bestNeeds?: string[];
  stats?: Stats;
  accountSection?: AccountSection;
}

export interface HistoryLog {
  content: LogContent;
}
