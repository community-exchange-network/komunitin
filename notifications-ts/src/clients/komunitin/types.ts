export interface Address {
  streetAddress?: string;
  addressLocality?: string;
  postalCode?: string;
  addressRegion?: string;
  addressCountry?: string;
}

export interface Location {
  name?: string;
  type: "Point";
  coordinates: [number, number];
}

export interface Image {
  url: string;
  alt?: string;
}

type ResourceIdentifier = {
  id: string;
  type: string;
}

export interface Member {
  id: string;
  type: "members";
  attributes: {
    name: string;
    code: string;
    image: Image | null;
    description: string;
    status: "draft" | "pending" | "active" | "disabled" | "suspended" | "deleted";
    created: string;
    updated: string;
    address: Address | null;
    location: Location | null;
    [key: string]: any;
  };
  relationships: {
    account: { data: ResourceIdentifier };
    needs: { meta: { count: number } };
    offers: { meta: { count: number } };
  };
}

interface BasePost {
  id: string;
  attributes: {
    code: string;
    title: string | null;
    images: Image[] | null;
    description: string;
    status: "draft" | "published" | "hidden";
    created: string;
    updated: string;
    expires: string | null;
  };
  relationships: {
    member: { data: ResourceIdentifier };
    category?: { data: ResourceIdentifier | null };
  };
}

export interface Offer extends BasePost {
  type: "offers";
  attributes: BasePost["attributes"] & {
    value?: string | null;
  };
}

export interface Need extends BasePost {
  type: "needs";
  attributes: BasePost["attributes"] & {
    fulfilled?: string | null;
  };
}

export type Post = Offer | Need;

export interface Currency {
  id: string;
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
  type: "groups";
  attributes: {
    code: string;
    name: string;
    status: "pending" | "active" | "disabled";
    location: Location | null;
    address: Address | null;
    image: Image | null;
  };
  relationships: {
    admins: {
      links: { related: string };
      meta: { count: number };
    };
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
  type: "users";
  attributes: {
    email: string;
    name?: string | null;
    language: string | null;
    created: string;
    updated: string;
  };
}

export interface MemberUser {
  id: string;
  type: "member-users";
  attributes: {
    notifications: {
      myAccount: boolean;
      group: boolean;
    };
    emails: {
      myAccount: boolean;
      group: "never" | "weekly" | "monthly";
    };
  };
  relationships: {
    user: { data: ResourceIdentifier };
    member: { data: ResourceIdentifier };
  };
}

export type MemberUserWithResources = {
  memberUser: MemberUser;
  user: User;
  member: Member;
};

export type Membership = {
  memberUser: MemberUser;
  member: Member;
};

export type Recipient = {
  user: User;
  memberships: Membership[];
  /** The relation that caused a member-specific delivery. */
  membership?: Membership;
};

export interface ExternalResource {
  id: string;
  type: string;
  meta: {
    external: true;
    href: string;
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
    meta: Record<string, any>;
    created: string;
    updated: string;
    state: string;
  };
  relationships: {
    payer: { data: { id: string, type: string } };
    payee: { data: { id: string, type: string } };
    currency: { data: { id: string, type: string } };
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
