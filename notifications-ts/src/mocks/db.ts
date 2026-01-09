import { faker } from '@faker-js/faker';
import { ACCOUNTING_URL } from './handlers';
import { group } from 'console';

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

// -- Factories --

export const createGroups = () => {
  ["GRP1", "GRP2", "GRP3"].forEach(code => createGroup(code));
}

export const createGroup = (code: string) => {
  if (db.groups.find(g => g.attributes.code === code)) return;

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
      symbol: 'TC',
      decimals: 2,
      scale: 2,
      rate: { n: 100, d: 1 }
    }
  });
};

export const createMembers = (code: string) => {
  createGroup(code);
  const groupId = `group-${code}`;
  // Check if members already exist for this group
  if (db.members.some(m => m.relationships.group.data.id === groupId)) return;

  for (let m = 0; m < 5; m++) {
    const memberId = `member-${code}-${m}`;
    const userId = `user-${code}-${m}`;
    const accountId = `account-${code}-${m}`;
    const userCode = `user${code}${m}`;

    // Member
    db.members.push({
      type: 'members',
      id: memberId,
      attributes: {
        code: userCode,
        name: `Member ${code}-${m}`,
        image: m % 3 === 0 ? null : faker.image.avatar(),
        location: { type: 'Point', coordinates: [faker.location.longitude(), faker.location.latitude()] },
        description: faker.lorem.sentence()
      },
      relationships: {
        account: {
          data: { type: 'accounts', id: accountId },
          links: { related: `${ACCOUNTING_URL}/${code}/accounts/${accountId}` }
        },
        user: { data: { type: 'users', id: userId } },
        group: { data: { type: 'groups', id: groupId } }
      }
    });

    // User
    db.users.push({
      type: 'users',
      id: userId,
      attributes: { email: `${userCode}@example.com` },
      relationships: {
        settings: { data: { type: 'user-settings', id: `${userId}-settings` } },
        members: { data: [{ type: 'members', id: memberId }] }
      }
    });

    // Settings
    db.userSettings.push({
      type: 'user-settings',
      id: `${userId}-settings`,
      attributes: {
        language: 'en',
        emails: { group: 'weekly', myAccount: true }
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
          data: { type: "currencies", id: `currency-${code}` }
        }
      }
    });
  }
};

export const createOffers = (code: string) => {
  createMembers(code);
  const groupId = `group-${code}`;
  if (db.offers.some(o => o.relationships.group.data.id === groupId)) return;

  const members = db.members.filter(m => m.relationships.group.data.id === groupId);
  members.forEach((member, m) => {
    for (let o = 0; o < 3; o++) {
      db.offers.push({
        type: 'offers',
        id: `offer-${code}-${m}-${o}`,
        attributes: {
          name: faker.commerce.productName(),
          content: faker.lorem.paragraph(),
          price: faker.commerce.price(),
          images: [faker.image.url()],
          code: faker.string.alphanumeric(8).toUpperCase(),
          created: faker.date.past().toISOString(),
          updated: faker.date.past().toISOString(),
        },
        relationships: {
          member: { data: { type: 'members', id: member.id } },
          group: { data: { type: 'groups', id: groupId } }
        }
      });
    }
  });
};

export const createNeeds = (code: string) => {
  createMembers(code);
  const groupId = `group-${code}`;
  if (db.needs.some(n => n.relationships.group.data.id === groupId)) return;

  const members = db.members.filter(m => m.relationships.group.data.id === groupId);
  members.forEach((member, m) => {
    for (let n = 0; n < 2; n++) {
      db.needs.push({
        type: 'needs',
        id: `need-${code}-${m}-${n}`,
        attributes: {
          name: faker.commerce.productName(),
          content: faker.lorem.paragraph(),
          images: [faker.image.url()],
          code: faker.string.alphanumeric(8).toUpperCase(),
          created: faker.date.past().toISOString(),
          updated: faker.date.past().toISOString(),
        },
        relationships: {
          member: { data: { type: 'members', id: member.id } },
          group: { data: { type: 'groups', id: groupId } }
        }
      });
    }
  });
};

export const createTransfers = (code: string) => {
  createMembers(code);
  const groupId = `group-${code}`;
  // Check if transfers exist (heuristic: check if any transfer ID contains group code)
  if (db.transfers.some(t => t.id.startsWith(`transfer-${code}`))) return;

  const members = db.members.filter(m => m.relationships.group.data.id === groupId);

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