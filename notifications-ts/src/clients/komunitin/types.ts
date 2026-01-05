export interface Address {
  streetAddress: string;
  addressLocality: string;
  postalCode: string;
  addressRegion: string;
  addressCountry: string;
}

export interface Member {
  id: string;
  attributes: {
    name: string;
    image: string;
    description: string;
    address?: Address;
    location?: {
      name?: string;
      type: "Point";
      coordinates: [number, number];
    };
    [key: string]: any;
  };
  relationships?: any;
}

export interface Offer {
  id: string;
  attributes: {
    code: string;
    name: string;
    images: string[];
    content: string;
    created: string;
    updated: string;
    expires: string;
    // add other fields
  };
  relationships: {
    member: { data: { id: string } }
  },
}

export interface Need {
  id: string;
  attributes: {
    code: string;
    images: string[];
    content: string;
    created: string;
    updated: string;
    expires: string;
  };
  relationships: {
    member: { data: { id: string } }
  },
}

export interface Currency {
  attributes: {
    code: string;
    name: string;
    namePlural: string;
    symbol: string;
    decimals: number;
    scale: number;
    rate: {n: number, d: number}
  };
}

export interface Group {
  id: string;
  attributes: {
    code: string;
    name: string;
    status: "pending" | "active" | "disabled";
    // ... other fields
  };
}

export interface GroupSettings {
  id: string;
  attributes: {
    enableGroupEmail: boolean;
    // ... other fields
  };
}

export interface User {
  id: string;
  attributes: {
    email: string;
    created: string;
    updated: string;
  };
  relationships: {
    settings: { data: { id: string, type: string } };
    members: { data: { id: string, type: string }[] };
  };
}

export interface UserSettings {
  id: string;
  attributes: {
    language: string;
    komunitin: boolean;
    notifications: {
      myAccount: boolean;
      newNeeds: boolean;
      newOffers: boolean;
      newMembers: boolean;
    };
    emails: {
      myAccount: boolean;
      group: "never" | "daily" | "weekly" | "monthly" | "quarterly";
    };
  };
  relationships: {
    user: { data: { id: string, type: string } };
  };
}

export interface Account {
  id: string;
  attributes: {
    code: string;
    balance: number;
    status: "active" | "disabled" | "suspended" | "deleted";
    creditLimit: number;
    maximumBalance: number | false;
  };
  relationships: {
    currency: { data: { id: string, type: string } };
    settings?: { data: { id: string, type: string } };
  };
}

export interface Transfer {
  id: string;
  attributes: {
    amount: number;
    created: string;
    state: string;
    // ... other fields
  };
}

export interface TransferStats {
  attributes: {
    values: number[];
  };
}

export interface AccountStats {
  attributes: {
    values: number[];
  };
}
