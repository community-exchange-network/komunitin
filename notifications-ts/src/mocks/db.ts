import { faker } from '@faker-js/faker';
import { Image, Member, Post } from '../clients/komunitin/types';
import { ACCOUNTING_URL, EXTERNAL_URL, SOCIAL_URL } from './handlers';

const IN_30_DAYS = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
const IN_90_DAYS = new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000);

// -- Data Store --
export const db = {
  groups: [] as any[],
  groupAdmins: [] as { groupId: string; userId: string }[],
  groupsSettings: [] as any[],
  currencies: [] as any[],
  members: [] as any[],
  users: [] as any[],
  userSettings: [] as any[],
  accounts: [] as any[],
  offers: [] as any[],
  needs: [] as any[],
  transfers: [] as any[],
  // External transfer support
  externalAccountRefs: [] as any[], // ExternalResource objects included in transfers
  externalAccounts: [] as any[],   // Account data served by external server
  externalCurrencies: [] as any[], // Currency data served by external server
  blockedPaths: new Set<string>(), // social paths that should return 404 (e.g. 'EXTGRP3')
};

export const resetDb = () => {
  db.groups.length = 0;
  db.groupAdmins.length = 0;
  db.groupsSettings.length = 0;
  db.currencies.length = 0;
  db.members.length = 0;
  db.users.length = 0;
  db.userSettings.length = 0;
  db.accounts.length = 0;
  db.offers.length = 0;
  db.needs.length = 0;
  db.transfers.length = 0;
  db.externalAccountRefs.length = 0;
  db.externalAccounts.length = 0;
  db.externalCurrencies.length = 0;
  db.blockedPaths.clear();
};

export const getUserIdForMember = (memberId: string) => {
  const userId = db.members.find(member => member.id === memberId)?.relationships.user.data.id;
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    throw new Error(`No user found for member ${memberId}`);
  }
  return user.id;
};

// -- Factories --

export const createGroups = () => {
  if (db.groups.length > 0) {
    return db.groups;
  }
  ["GRP1", "GRP2", "GRP3"].forEach(code => createGroup(code));
}

export const createGroup = (code: string) => {
  const group = db.groups.find(g => g.attributes.code === code);
  if (group) {
    return group;
  }

  const id = `group-${code}`;
  const currencyCode = code;
  const adminUserId = `admin-${code}`;

  // Admin user for the group
  db.users.push({
    type: 'users',
    id: adminUserId,
    attributes: { email: `admin-${code.toLowerCase()}@example.com`, created: new Date().toISOString(), updated: new Date().toISOString() },
    relationships: {
      settings: { data: { type: 'user-settings', id: `${adminUserId}-settings` } }
    }
  });
  db.groupAdmins.push({ groupId: id, userId: adminUserId });

  db.userSettings.push({
    type: 'user-settings',
    id: `${adminUserId}-settings`,
    attributes: {
      language: 'en',
      komunitin: true,
      emails: { group: 'weekly', myAccount: true },
      notifications: { myAccount: true, group: true }
    },
    relationships: {
      user: { data: { type: 'users', id: adminUserId } }
    }
  });

  // Group
  db.groups.push({
    type: 'groups',
    id,
    attributes: {
      code,
      name: `Group ${code}`,
      status: 'active',
      access: 'public',
      image: null,
      address: null,
      location: { type: 'Point', coordinates: [2.1734, 41.3851] }
    },
    relationships: {
      admins: {
        links: { related: `${SOCIAL_URL}/${code}/admins` },
        meta: { count: 1 }
      },
      currency: { links: { related: `${ACCOUNTING_URL}/${code}/currency` } }
    }
  });

  // Settings
  db.groupsSettings.push({
    type: 'group-settings',
    id: `${id}`,
    attributes: {
      enableGroupEmail: true
    }
  })

  // Currency
  db.currencies.push({
    type: 'currencies',
    id: `currency-${code}`,
    attributes: {
      code: currencyCode,
      name: `${code} Currency`,
      namePlural: `${code} Credits`,
      symbol: code === 'GRP0' ? 'ħ' : 'TC',
      decimals: 2,
      scale: 2,
      rate: { n: 100, d: 1 }
    }
  });
};


export const createMember = (opts: {
  groupCode: string;
  id?: string;
  code?: string;
  name?: string;
  userId?: string;
  accountId?: string;
  attributes?: Record<string, any>;
  image?: Image | null;
}) => {
  createGroup(opts.groupCode);
  const groupId = `group-${opts.groupCode}`;
  
  const id = opts.id || `member-${opts.groupCode}-${Math.random().toString(36).substring(7)}`;
  const userId = opts.userId || `user-${id}`;
  const accountId = opts.accountId || `account-${id}`;
  const userCode = opts.code || `u${Math.random().toString(36).substring(7)}`;

  // Check if member already exists to avoid duplicates if ID provided
  if (db.members.find(m => m.id === id)) return db.members.find(m => m.id === id);

   // Member
   const member = {
    type: 'members',
    id: id,
    attributes: {
      code: userCode,
      name: opts.name || `Member ${userCode}`,
      image: opts.image !== undefined ? opts.image : { url: faker.image.avatar() },
      status: 'active',
      address: null,
      location: { type: 'Point', coordinates: [faker.location.longitude(), faker.location.latitude()] },
      description: faker.lorem.sentence(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...opts.attributes
    },
    relationships: {
      account: {
        data: { type: 'accounts', id: accountId },
        links: { related: `${ACCOUNTING_URL}/${opts.groupCode}/accounts/${accountId}` }
      },
      user: { data: { type: 'users', id: userId } },
      group: { data: { type: 'groups', id: groupId } },
      needs: { meta: { count: 0 } },
      offers: { meta: { count: 0 } }
    }
  };
  db.members.push(member);

  // User
  createUser({
    id: userId,
    email: `${userCode}@example.com`
  });

  // Account
  db.accounts.push({
    type: 'accounts',
    id: accountId,
    attributes: {
      code: accountId,
      balance: faker.number.int({ min: -500, max: 1000 }),
    },
    relationships: {
      currency: {
        data: { type: "currencies", id: `currency-${opts.groupCode}` }
      }
    }
  });

  return member;
};

export const createUser = (opts: {
  id: string;
  email: string;
}) => {
  const user = {
    type: 'users',
    id: opts.id,
    attributes: {
      email: opts.email,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    relationships: {
      settings: { data: { type: 'user-settings', id: `${opts.id}-settings` } }
    }
  };
  db.users.push(user);

  db.userSettings.push({
    type: 'user-settings',
    id: `${opts.id}-settings`,
    attributes: {
      language: 'en',
      emails: { group: 'weekly', myAccount: true },
      notifications: { myAccount: true, group: true }
    }
  });

  return user;
}

export const createMembers = (code: string) => {
  createGroup(code);
  const groupId = `group-${code}`;
  // Check if members already exist for this group
  if (db.members.some(m => m.relationships.group.data.id === groupId)) {
    return db.members.filter(m => m.relationships.group.data.id === groupId)
      .filter(m => m.id.match(`^member-${code}-\\d+$`)); // select only members created by this function
  }

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 60); // 60 days old
  const members: Member[] = []
  for (let m = 0; m < 5; m++) {
    members.push(createMember({
      groupCode: code,
      id: `member-${code}-${m}`,
      code: `user${code}${m}`,
      name: `Member ${code}-${m}`,
      userId: `user-${code}-${m}`,
      accountId: `account-${code}-${m}`,
      image: m % 3 === 0 ? null : undefined,
      attributes: { created: oldDate.toISOString(), updated: oldDate.toISOString() }
    }));
  }
  return members;
};

type PostType = Post['type'];

const postDefaults = {
  offers: {
    count: 3,
    expires: IN_90_DAYS,
    prefix: 'offer',
  },
  needs: {
    count: 2,
    expires: IN_30_DAYS,
    prefix: 'need',
  },
} satisfies Record<PostType, {
  count: number;
  expires: Date;
  prefix: string;
}>;

export const createPost = (type: PostType, opts: {
  id: string;
  code: string;
  groupCode: string;
  memberId?: string;
  attributes?: Partial<any>;
}) => {
  const members = createMembers(opts.groupCode);
  const groupId = `group-${opts.groupCode}`;

  const memberId = opts.memberId || members[0]?.id;

  if (!memberId) {
    throw new Error(`No member found for group ${opts.groupCode}`);
  }

  const created = faker.date.past();
  const posts = db[type];
  const post = {
    type,
    id: opts.id,
    attributes: {
      title: faker.commerce.productName(),
      description: faker.lorem.paragraph(),
      ...(type === 'offers' ? { price: faker.commerce.price() } : {}),
      images: [{ url: faker.image.url() }],
      code: opts.code,
      status: 'published',
      created: created.toISOString(),
      updated: created.toISOString(),
      expires: postDefaults[type].expires.toISOString(),
      ...opts.attributes,
    },
    relationships: {
      member: { data: { type: 'members', id: memberId } },
      group: { data: { type: 'groups', id: groupId } }
    }
  };

  posts.push(post);
  const member = db.members.find(m => m.id === memberId);
  if (member) {
    member.relationships[type].meta.count = posts
      .filter(post => post.relationships.member.data.id === memberId)
      .length;
  }

  return post;
};

export const createPosts = (type: PostType, code: string) => {
  const members = createMembers(code);
  const groupId = `group-${code}`;
  const posts = db[type];
  if (posts.some(post => post.relationships.group.data.id === groupId)) {
    return;
  }

  members.forEach((member, m) => {
    for (let p = 0; p < postDefaults[type].count; p++) {
      createPost(type, {
        id: `${postDefaults[type].prefix}-${code}-${m}-${p}`,
        code: faker.string.alphanumeric(8).toUpperCase(),
        groupCode: code,
        memberId: member.id,
      });
    }
  });
};

/**
 * Create an external transfer where the local account is the payer and an
 * external account (ExternalResource) is the payee.
 *
 * @param opts.localGroupCode  Local group to use as payer (will call createMembers)
 * @param opts.externalGroupCode  Group code on the external server, used as
 *   currency code and in account href.
 * @param opts.externalAccountAccessible  Whether the external server returns the account.
 * @param opts.externalCurrencyAccessible  Whether the external server returns the currency.
 * @param opts.externalMemberAccessible  Whether the social server returns a member
 *   for the external account (requires externalAccountAccessible to be true).
 * @param opts.externalGroupAccessible  Whether the social server returns a group for the
 *   external currency code. When false the group path is added to db.blockedPaths.
 * @param opts.creditCommonsPayeeAddress  When set the transfer meta will include a
 *   creditCommons object with this as the payeeAddress.
 */
export const createExternalTransfer = (opts: {
  localGroupCode: string;
  externalGroupCode: string;
  externalAccountAccessible: boolean;
  externalCurrencyAccessible: boolean;
  externalMemberAccessible: boolean;
  externalGroupAccessible: boolean;
  creditCommonsPayeeAddress?: string;
}) => {
  const members = createMembers(opts.localGroupCode);
  const localMember = members[0];
  const localAccount = db.accounts.find(a => a.id === localMember.relationships.account.data.id)!;

  const extGroupCode = opts.externalGroupCode;
  const extAccountId = `ext-account-${extGroupCode.toLowerCase()}`;
  const extAccountHref = `${EXTERNAL_URL}/${extGroupCode}/accounts/${extAccountId}`;

  // ExternalResource included in the transfer response
  const externalRef = {
    id: extAccountId,
    type: 'accounts',
    meta: {
      external: true,
      href: extAccountHref,
    },
  };
  db.externalAccountRefs.push(externalRef);

  const meta: Record<string, any> = opts.creditCommonsPayeeAddress
    ? {
        creditCommons: {
          payerAddress: `${opts.localGroupCode}/${localAccount.attributes.code}`,
          payeeAddress: opts.creditCommonsPayeeAddress,
        },
      }
    : { description: `External transfer to ${extGroupCode}` };

  const transfer = {
    type: 'transfers',
    id: `transfer-ext-${extGroupCode.toLowerCase()}`,
    attributes: {
      amount: 100,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      state: 'committed',
      meta,
    },
    relationships: {
      payer: { data: { type: 'accounts', id: localAccount.id } },
      payee: { data: { type: 'accounts', id: extAccountId } },
    },
  };
  db.transfers.push(transfer);

  // External account data served by the external server
  if (opts.externalAccountAccessible) {
    db.externalAccounts.push({
      groupCode: extGroupCode,
      id: extAccountId,
      data: {
        type: 'accounts',
        id: extAccountId,
        attributes: {
          code: `ext-user-${extGroupCode.toLowerCase()}`,
          balance: 500,
          status: 'active',
          creditLimit: 0,
          maximumBalance: false,
        },
        relationships: {
          currency: { data: { type: 'currencies', id: `currency-${extGroupCode}` } },
        },
      },
    });
  }

  // External currency data served by the external server
  if (opts.externalCurrencyAccessible) {
    db.externalCurrencies.push({
      groupCode: extGroupCode,
      data: {
        type: 'currencies',
        id: `currency-${extGroupCode}`,
        attributes: {
          code: extGroupCode,
          name: `${extGroupCode} Currency`,
          namePlural: `${extGroupCode} Credits`,
          symbol: 'EXT',
          decimals: 2,
          scale: 2,
          rate: { n: 100, d: 1 },
        },
      },
    });
  }

  // Member on the (local) social server for the external account.
  // We push directly to db.members WITHOUT adding to db.accounts, so that the
  // transfer handler still classifies the payee account as external (lack of an
  // entry in db.accounts prevents it from being found as a "local" account).
  if (opts.externalMemberAccessible && opts.externalAccountAccessible) {
    createGroup(extGroupCode);
    const extMemberId = `member-${extAccountId}`;
    db.members.push({
      type: 'members',
      id: extMemberId,
      attributes: {
        code: `ext-user-${extGroupCode.toLowerCase()}`,
        name: `External Member ${extGroupCode}`,
        image: null,
        location: { type: 'Point', coordinates: [0, 0] },
        description: '',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      relationships: {
        account: {
          data: { type: 'accounts', id: extAccountId },
          links: { related: `${EXTERNAL_URL}/${extGroupCode}/accounts/${extAccountId}` },
        },
        user: { data: { type: 'users', id: `user-${extMemberId}` } },
        group: { data: { type: 'groups', id: `group-${extGroupCode}` } },
        needs: { meta: { count: 0 } },
        offers: { meta: { count: 0 } },
      },
    });
  }

  // Block the group path so getCachedGroup throws for the external currency code
  if (!opts.externalGroupAccessible) {
    db.blockedPaths.add(extGroupCode);
  }

  const localUser = db.users.find(u => u.id === getUserIdForMember(localMember.id))!;

  return {
    transfer,
    localGroupCode: opts.localGroupCode,
    localAccountId: localAccount.id,
    localMember,
    localUser,
    extAccountId,
    externalGroupCode: extGroupCode,
    externalRef,
  };
};

export const createTransfers = (code: string) => {
  const members = createMembers(code);
  
  // Check if transfers exist (heuristic: check if any transfer ID contains group code)
  if (db.transfers.some(t => t.id.startsWith(`transfer-${code}`))) return;

  // Create circular transfers: 0->1, 1->2, 2->3, 3->4, 4->0
  members.forEach((payer, i) => {
    const payee = members[(i + 1) % members.length];

    // Resolve accounts
    const payerAccount = db.accounts.find(a => a.id === payer.relationships.account.data.id);
    const payeeAccount = db.accounts.find(a => a.id === payee.relationships.account.data.id);

    // Create 2 transfers per link for variance
    for (let j = 0; j < 2; j++) {
      const transferId = `transfer-${code}-${i}-${(i + 1) % members.length}-${j}`;
      db.transfers.push({
        type: 'transfers',
        id: transferId,
        attributes: {
          amount: faker.number.int({ min: 10, max: 100 }),
          created: faker.date.recent({ days: 15 }).toISOString(),
          updated: new Date().toISOString(),
          state: 'committed',
          meta: { description: `Transfer from ${payer.attributes.name} to ${payee.attributes.name}` }
        },
        relationships: {
          payer: { data: { type: 'accounts', id: payerAccount.id } },
          payee: { data: { type: 'accounts', id: payeeAccount.id } }
        }
      });
    }
  });
};
