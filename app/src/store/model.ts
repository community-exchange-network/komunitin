

/**
 * See https://jsonapi.org/format/#document-resource-identifier-objects
 */
export interface ResourceIdentifierObject {
  type: string;
  id: string;
  meta?: Record<string, unknown>
}

export interface ExternalResourceIdentifierObject extends ResourceIdentifierObject {
  meta: {
    external: true
    href: string
  }
}

export type Relationship = RelatedResource | RelatedLinkedCollection | RelatedCollection ;
export interface ResourceObject extends ResourceIdentifierObject {
  links: {
    self: string;
  };
  attributes?: Record<string, unknown>
  relationships?: Record<string, Relationship>
}

export interface ErrorObject {
  status: number;
  code: string;
  title: string;
}

export type SuccessfulResponse<T extends ResourceObject, I extends ResourceObject> =
  | ResourceResponse<T>
  | CollectionResponse<T>
  | ResourceResponseInclude<T, I>
  | CollectionResponseInclude<T, I>;

export interface ErrorResponse {
  errors: ErrorObject[];
}

export interface ResourceResponse<T extends ResourceObject> {
  data: T;
}

export interface CollectionResponse<T extends ResourceObject> {
  links: {
    self: string;
    //first: string;
    prev: string | null;
    next: string | null;
  };
  meta: {
    count: number;
  };
  data: T[];
}

export interface CollectionResponseInclude<
  T extends ResourceObject,
  I extends ResourceObject
> extends CollectionResponse<T> {
  included: I[];
}

export interface ResourceResponseInclude<
  T extends ResourceObject,
  I extends ResourceObject
> extends ResourceResponse<T> {
  included: I[];
}

/**
 * Geolocation model.
 *
 * Currently it only supports the Point type but it may be extended in
 * the future following the GeoJSON spec.
 */
export interface Location {
  name: string;
  type: "Point";
  coordinates: [number, number]; //longitude and latitude
}

export type ImageObject = string;

/**
 * To-many relationship.
 * 
 * Contains the count metadata.
 */
export interface RelatedCollection {
  links: {
    related: string;
  };
  meta: {
    count: number;
  };
  // This is a hack to avoid type issues when dealing
  // with Relationship type and asking the `data` attribute.
  data: undefined;
}

/**
 * Embedded To-many relationship.
 */
export interface RelatedLinkedCollection {
  data: ResourceIdentifierObject[]
}

/**
 * To-one relationship.
 * 
 * Contains linkage to the related resource.
 */
export interface RelatedResource {
  links: {
    related: string;
  },
  data: ResourceIdentifierObject | ExternalResourceIdentifierObject
}

/**
 * Extension Resource Object for the inclusion of external relationships.
 * 
 * Defined in External Relationship custom JSON:API profile:
 * https://github.com/komunitin/komunitin-api/blob/master/jsonapi-profiles/external.md
 */
export interface ExternalResourceObject extends ResourceObject {
  relationships?: undefined;
  meta: {
    external : true
    href: string
  }
}

/**
 * User model.
 */
export interface User extends ResourceObject {
  attributes: {
    email: string,
    created: string,
    updated: string,
  },
  relationships: {
    settings: RelatedResource,
    members: RelatedLinkedCollection
  }
}

export type MailingFrequency = "never" | "weekly" | "monthly";

export interface UserSettings extends ResourceObject {
  attributes: {
    language: string
    komunitin: boolean
    notifications: {
      myAccount: boolean
      newNeeds: boolean
      newOffers: boolean
      newMembers: boolean
    },
    emails: {
      myAccount: boolean
      group: MailingFrequency
    }
  },
  relationships: {
    user: RelatedResource
  }
}

/**
 * Contact model.
 */
export interface Contact extends ResourceObject {
  attributes: {
    type: string;
    name: string;
  };
}

export type Access = "public" | "group" | "private";

/**
 * Full group model.
 */
export interface Group extends ResourceObject {
  attributes: {
    code: string;
    name: string;
    status: "pending" | "active" | "disabled"
    description: string;
    image: ImageObject;
    website: string;
    access: Access;
    location: Location;
    address: Address;
    created: string;
    updated: string;
  };
  relationships: {
    contacts: RelatedLinkedCollection;
    members: RelatedCollection;
    categories: RelatedCollection;
    offers: RelatedCollection;
    needs: RelatedCollection;
    posts: RelatedCollection;
    currency: RelatedResource;
    settings: RelatedResource;
  };
}

export interface GroupSettings extends ResourceObject {
  attributes: {
    requireAcceptTerms: boolean;
    terms: string;
    minOffers: number;
    minNeeds: number;
    allowAnonymousMemberList: boolean;
    enableGroupEmail: boolean;
    defaultGroupEmailFrequency: MailingFrequency;
  },
  relationships: {
    group: RelatedResource;
  }
}

/**
 * Category interface.
 */
export interface Category extends ResourceObject {
  attributes: {
    code: string;
    name: string;
    cpa: string[];
    description: string;
    /**
     * The category icon, following the same convention as Quasar framework for icon components:
     * https://quasar.dev/vue-components/icon
     */
    icon: string;
    access: Access;
    created: string;
    updated: string;
  };
  relationships: {
    group: RelatedResource;
    needs: RelatedCollection;
    offers: RelatedCollection;
  };
}

/**
 * Address interface.
 */
export interface Address {
  streetAddress: string;
  addressLocality: string;
  postalCode: string;
  addressRegion: string;
  addressCountry: string;
}

export type MemberState = "draft" | "pending" | "active" | "disabled" | "suspended" | "deleted"

/**
 * Member interface.
 */
export interface Member extends ResourceObject {
  attributes: {
    code: string;
    access: Access;
    name: string;
    type: "personal" | "business" | "public";
    state: MemberState;
    description: string;
    image: ImageObject;
    address: Address;
    location: Location;
    created: string;
    updated: string;
  };
  relationships: {
    contacts: RelatedLinkedCollection;
    group: RelatedResource;
    needs: RelatedCollection;
    offers: RelatedCollection;
    account: RelatedResource;
  };
}

/**
 * Currency.
 *
 * https://github.com/komunitin/komunitin-api/blob/master/accounting/README.md#currency
 *
 * {
 *   "type": "currencies",
 *   "id": "XXXX",
 *   "attributes": {
 *       "code-type": "CEN",
 *       "code": "WDLD",
 *       "name": "wonder",
 *       "name-plural": "wonders",
 *       "symbol": "₩",
 *       "decimals": 2,
 *       "scale": 4,
 *       "value": 100000,
 *   }
 * }
 */
export interface Currency extends ResourceObject {
  attributes: {
    codeType: string;
    code: string;
    name: string;
    namePlural: string;
    symbol: string;
    decimals: number;
    scale: number;
    /**
     * @deprecated Use rate instead.
     */
    value: number;
    
    rate: {
      n: number,
      d: number
    }
  };
}

export type AccountStatus = "active" | "disabled" | "suspended" | "deleted"

/**
 * Account model
 * 
 * https://github.com/komunitin/komunitin-api/blob/master/accounting/README.md#account
 */
export interface Account extends ResourceObject {
  attributes: {
    code: string;
    balance: number;
    status: AccountStatus
    creditLimit: number;
    maximumBalance: number | false;
    //capabilities: ["pay", "charge"],
  };
  relationships: {
    currency: RelatedResource;
    settings?: RelatedResource;
  }
}

export interface AccountTag {
  id?: string,
  name: string,
  value?: string,
  hash?: string,
  updated?: string
}

export interface AccountSettings extends ResourceObject {
  // null or undefined means default by currency settings
  attributes: {
    // Payment directions
    allowPayments?: boolean | null,
    allowPaymentRequests?: boolean | null,

    // Payment workflows
    allowSimplePayments?: boolean | null,
    allowSimplePaymentRequests?: boolean | null,
    allowQrPayments?: boolean | null,
    allowQrPaymentRequests?: boolean | null,
    allowMultiplePayments?: boolean | null,
    allowMultiplePaymentRequests?: boolean | null
    allowTagPayments?: boolean | null
    allowTagPaymentRequests?: boolean | null

    // PR acceptance
    acceptPaymentsAutomatically: boolean | null,
    acceptPaymentsWhitelist?: string[] | null,
    acceptPaymentsAfter?: number | false | null
    
    // External payments
    allowExternalPayments?: boolean | null,
    allowExternalPaymentRequests?: boolean | null,
    acceptExternalPaymentsAutomatically?: boolean | null,

    // Other features
    onPaymentCreditLimit?: number | false | null
    
    // Tags
    tags?: AccountTag[] | null

    // Privacy
    hideBalance?: boolean | null
  }
  relationships: {
    account: RelatedResource
  }
}

export type TransferState = "new" | "pending" | "accepted" | "committed" | "rejected" | "failed" | "deleted"
export type AnyJson = string | number | boolean | null | undefined | { [key: string]: AnyJson } | AnyJson[];

export type TransferMeta = {
  description: string;
  creditCommons?: {
    payeeAddress?: string
    payerAddress?: string;
  };
  [key: string]: AnyJson
}

export interface Transfer extends ResourceObject {
  attributes: {
    amount: number,
    meta: TransferMeta,
    state: TransferState;
    authorization?: {
      type: "tag",
      value: string
    }
    expires?: string;
    created: string;
    updated: string;
  },
  relationships: {
    payer: RelatedResource,
    payee: RelatedResource,
    currency: RelatedResource,
  }
}

export interface ExtendedTransfer extends Transfer {
  payer: ExtendedAccount;
  payee: ExtendedAccount;
}

export interface ExtendedAccount extends Account {
  member: Member & {group: Group}
  currency: Currency
}

/**
 * Offer model.
 */
export interface Offer extends ResourceObject {
  attributes: {
    code: string;
    name: string;
    content: string;
    images: ImageObject[];
    price: string;
    access: Access;
    expires: string;
    created: string;
    updated: string;
    state: OfferState;
  };
  relationships: {
    category: RelatedResource;
    member: RelatedResource;
  };
}

export type NeedState = "hidden" | "published";
export type OfferState = NeedState;

/**
 * Need model
 */
export interface Need extends ResourceObject {
  attributes: {
    code: string;
    content: string;
    images: ImageObject[];
    access: Access;
    expires: string;
    created: string;
    updated: string;
    state: NeedState;
  };
  relationships: {
    category: RelatedResource;
    member: RelatedResource;
  };
}

export interface NotificationsSubscription extends ResourceObject {
  attributes: {
    token: string;
    // Here it goes the notification settings as an embedded map.
    // settings: NotificationsSettings
  };
  relationships: {
    user: RelatedResource;
    member: RelatedResource;
  }
}

export interface Trustline extends ResourceObject {
  attributes: {
    limit: number,
    balance: number,
    created: string,
    updated: string
  };
  relationships: {
    trusted: RelatedResource,
    currency: RelatedResource
  }
}

export interface CurrencySettings extends ResourceObject {
  attributes: {
    defaultInitialCreditLimit: number
    defaultInitialMaximumBalance: number | false
    defaultAllowPayments: boolean
    defaultAllowPaymentRequests: boolean
    defaultAcceptPaymentsAutomatically: boolean
    defaultAcceptPaymentsWhitelist: string[]
    defaultAllowSimplePayments: boolean
    defaultAllowSimplePaymentRequests: boolean
    defaultAllowQrPayments: boolean
    defaultAllowQrPaymentRequests: boolean
    defaultAllowMultiplePayments: boolean
    defaultAllowMultiplePaymentRequests: boolean
    defaultAllowTagPayments: boolean;
    defaultAllowTagPaymentRequests: boolean;
    defaultAcceptPaymentsAfter: number | false
    defaultOnPaymentCreditLimit: number | false
    defaultAllowExternalPayments: boolean
    defaultAllowExternalPaymentRequests: boolean
    defaultAcceptExternalPaymentsAutomatically: boolean
    enableExternalPayments: boolean
    enableExternalPaymentRequests: boolean
    enableCreditCommonsPayments: boolean
    externalTraderCreditLimit: number
    externalTraderMaximumBalance: number | false
    defaultHideBalance: boolean
  }
}

export interface CurrencyStatsData extends ResourceObject {
  attributes: {
    values: number[]
  }
}

export interface Notification extends ResourceObject {
  attributes: {
    title: string
    body: string
    image: string | null
    read: string | null
    created: string
    data: Record<string, unknown> | null
  }
}