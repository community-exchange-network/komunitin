import { faker } from '@faker-js/faker';
import { Member } from '../clients/komunitin/types';
import { ACCOUNTING_URL } from './handlers';

const IN_30_DAYS = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
const IN_90_DAYS = new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000);

// -- Data Store --
export const db = {
  groups: [] as any[],
  groupsSettings: [] as any[],
  currencies: [] as any[],
  members: [] as any[],
  users: [] as any[],
  userSettings: [] as any[],
  accounts: [] as any[],
  offers: [] as any[],
  needs: [] as any[],
  transfers: [] as any[],
};

export const resetDb = () => {
  db.groups.length = 0;
  db.groupsSettings.length = 0;
  db.currencies.length = 0;
  db.members.length = 0;
  db.users.length = 0;
  db.userSettings.length = 0;
  db.accounts.length = 0;
  db.offers.length = 0;
  db.needs.length = 0;
  db.transfers.length = 0;
};

export const getUserIdForMember = (memberId: string) => {
  const user = db.users.find(u => u.relationships.members.data.some((r: any) => r.id === memberId));
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

  // Group
  db.groups.push({
    type: 'groups',
    id,
    attributes: {
      code,
      name: `Group ${code}`,
      access: 'public',

      location: { type: 'Point', coordinates: [2.1734, 41.3851] }
    },
    relationships: {
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
  image?: string | null;
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
      image: opts.image !== undefined ? opts.image : faker.image.avatar(),
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
  db.users.push({
    type: 'users',
    id: userId,
    attributes: { email: `${userCode}@example.com` },
    relationships: {
      settings: { data: { type: 'user-settings', id: `${userId}-settings` } },
      members: { data: [{ type: 'members', id: id }] }
    }
  });

  // Settings
  db.userSettings.push({
    type: 'user-settings',
    id: `${userId}-settings`,
    attributes: {
      language: 'en',
      emails: { group: 'weekly', myAccount: true },
      notifications: { myAccount: true, group: true }
    }
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

export const createOffer = (opts: {
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
  const offer = {
    type: 'offers',
    id: opts.id,
    attributes: {
      name: faker.commerce.productName(),
      content: faker.lorem.paragraph(),
      price: faker.commerce.price(),
      images: [faker.image.url()],
      code: opts.code,
      created: created.toISOString(),
      updated: created.toISOString(),
      expires: IN_90_DAYS.toISOString(),
      ...opts.attributes,
    },
    relationships: {
      member: { data: { type: 'members', id: memberId } },
      group: { data: { type: 'groups', id: groupId } }
    }
  };
  
  db.offers.push(offer);

  const member = db.members.find(m => m.id === memberId);
  if (member) {
    const offerCount = db.offers.filter(o => o.relationships.member.data.id === memberId).length;
    member.relationships.offers.meta.count = offerCount;
  }
  
  return offer;
};

export const createOffers = (code: string) => {
  const members = createMembers(code);
  const groupId = `group-${code}`;
  if (db.offers.some(o => o.relationships.group.data.id === groupId)) {
    return;
  }

  members.forEach((member, m) => {
    for (let o = 0; o < 3; o++) {
      createOffer({
        id: `offer-${code}-${m}-${o}`,
        code: faker.string.alphanumeric(8).toUpperCase(),
        groupCode: code,
        memberId: member.id,
      });
    }
  });
};

export const createNeed = (opts: {
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
  const need = {
    type: 'needs',
    id: opts.id,
    attributes: {
      name: faker.commerce.productName(),
      content: faker.lorem.paragraph(),
      images: [faker.image.url()],
      code: opts.code,
      created: created.toISOString(),
      updated: created.toISOString(),
      expires: IN_30_DAYS.toISOString(),
      ...opts.attributes,
    },
    relationships: {
      member: { data: { type: 'members', id: memberId } },
      group: { data: { type: 'groups', id: groupId } }
    }
  };
  
  db.needs.push(need);

  const member = db.members.find(m => m.id === memberId);
  if (member) {
    const needCount = db.needs.filter(n => n.relationships.member.data.id === memberId).length;
    member.relationships.needs.meta.count = needCount;
  }

  return need;
};

export const createNeeds = (code: string) => {
  const members = createMembers(code);
  const groupId = `group-${code}`;
  if (db.needs.some(n => n.relationships.group.data.id === groupId)) return;

  members.forEach((member, m) => {
    for (let n = 0; n < 2; n++) {
      createNeed({
        id: `need-${code}-${m}-${n}`,
        code: faker.string.alphanumeric(8).toUpperCase(),
        groupCode: code,
        memberId: member.id,
      });
    }
  });
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