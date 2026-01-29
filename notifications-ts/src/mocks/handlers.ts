import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';

faker.seed(123);

const SOCIAL_URL = 'http://social.test';
const ACCOUNTING_URL = 'http://accounting.test';
const AUTH_URL = 'http://auth.test';

// Helpers to generate consistent data
const createGroup = (code: string, i: number) => ({
  type: 'groups',
  id: faker.string.uuid(),
  attributes: {
    code,
    name: `Group ${i}`,
    access: 'public',
    city: faker.location.city(),
    location: {
      type: 'Point',
      coordinates: [2.1734, 41.3851] // Barcelona coordinates
    }
  },
  relationships: {
    currency: {
      links: {
        related: `${ACCOUNTING_URL}/${code}/currency`
      }
    }
  }
});

const createMember = (groupCode: string, i: number) => {
  const id = faker.string.uuid();
  return {
    type: 'members',
    id,
    attributes: {
      code: faker.internet.username(),
      name: faker.person.fullName(),
      image: i % 3 === 0 ? null : faker.image.avatar(),
      location: {
        type: 'Point',
        coordinates: [faker.location.longitude(), faker.location.latitude()]
      },
      description: faker.lorem.sentence()
    },
    relationships: {
      account: {
        data: { type: 'accounts', id: `${id}-account` },
        links: {
          related: `${ACCOUNTING_URL}/${groupCode}/accounts/${id}-account`
        }
      },
      user: {
        data: { type: 'users', id: `user-${i}` }
      }
    }
  };
};

const createOffer = (groupCode: string, i: number) => {
  const created = faker.date.past().toISOString();
  return {
    type: 'offers',
    id: faker.string.uuid(),
    attributes: {
      name: faker.commerce.productName(),
      content: faker.lorem.paragraph(),
      price: faker.commerce.price(),
      images: [faker.image.url()],
      code: faker.string.alphanumeric(8).toUpperCase(),
      created,
      updated: created,
    },
    relationships: {
      member: {
        data: { type: 'members', id: `member-${i}` }
      },
    }
  };
};

const createNeed = (groupCode: string, i: number) => {
  const created = faker.date.past().toISOString();
  return {
    type: 'needs',
    id: faker.string.uuid(),
    attributes: {
      name: faker.commerce.productName(),
      content: faker.lorem.paragraph(),
      images: [faker.image.url()],
      code: faker.string.alphanumeric(8).toUpperCase(),
      created,
      updated: created,
    },
    relationships: {
      member: {
        data: { type: 'members', id: `member-${i}` }
      },
    }
  }
};

const createAccount = (code: string, currency: string) => ({
  type: 'accounts',
  id: code,
  attributes: {
    code,
    balance: faker.number.int({ min: -500, max: 1000 }),
    currency: { code: currency }
  }
});

export const handlers = [
  // Auth API
  http.post(`${AUTH_URL}/token`, () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'komunitin_social_read_all komunitin_accounting_read_all'
    });
  }),

  http.post(`${AUTH_URL}/get-auth-code`, () => {
    return HttpResponse.json({
      code: 'mock-unsubscribe-token'
    });
  }),

  // Social API
  http.get(`${SOCIAL_URL}/groups`, () => {
    const groups = Array.from({ length: 3 }, (_, i) => createGroup(`GRP${i}`, i));
    return HttpResponse.json({ data: groups });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/members`, ({ params }) => {
    const { groupCode } = params;
    const members = Array.from({ length: 5 }, (_, i) => createMember(groupCode as string, i));
    return HttpResponse.json({ data: members });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/offers`, ({ params }) => {
    const { groupCode } = params;
    const offers = Array.from({ length: 3 }, (_, i) => createOffer(groupCode as string, i));
    return HttpResponse.json({ data: offers });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/needs`, ({ params }) => {
    const { groupCode } = params;
    const needs = Array.from({ length: 2 }, (_, i) => createNeed(groupCode as string, i));
    return HttpResponse.json({ data: needs });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/settings`, ({ params }) => {
    const { groupCode } = params;
    return HttpResponse.json({
      data: {
        type: 'group-settings',
        id: `${groupCode}-settings`,
        attributes: {
          enableGroupEmail: true
        }
      }
    });
  }),

  http.get(`${SOCIAL_URL}/users/:id`, ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      data: {
        type: 'users',
        id,
        attributes: {
          email: faker.internet.email(),
          locale: 'en'
        },
        relationships: {
          settings: {
            data: { type: 'user-settings', id: `${id}-settings` }
          }
        }
      },
      included: [
        {
          type: 'user-settings',
          id: `${id}-settings`,
          attributes: {
            language: 'en',
            emails: {
              group: 'weekly',
              myAccount: true
            }
          }
        }
      ]
    });
  }),

  http.get(`${SOCIAL_URL}/users/:id/settings`, ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      data: {
        type: 'user-settings',
        id: `${id}-settings`,
        attributes: {
          language: 'en',
          emails: {
            group: 'weekly',
            myAccount: true
          }
        }
      }
    });
  }),

  // Users List (for getMemberUsers)
  http.get(`${SOCIAL_URL}/users`, () => {
    // Return a single user for the requested member
    const id = faker.string.uuid();
    return HttpResponse.json({
      data: [{
        type: 'users',
        id,
        attributes: {
          email: faker.internet.email(),
          locale: 'en'
        },
        relationships: {
          settings: {
            data: { type: 'user-settings', id: `${id}-settings` }
          }
        }
      }],
      included: [
        {
          type: 'user-settings',
          id: `${id}-settings`,
          attributes: {
            language: 'en',
            emails: {
              group: 'weekly',
              myAccount: true
            }
          }
        }
      ]
    });
  }),

  // Accounting API
  // Currency
  http.get(`${ACCOUNTING_URL}/:code/currency`, ({ params }) => {
    const { code } = params;
    return HttpResponse.json({
      data: {
        type: 'currencies',
        id: faker.string.uuid(),
        attributes: {
          code,
          name: `${code} Currency`,
          namePlural: `${code} Credits`,
          symbol: code === 'GRP0' ? 'ħ' : code === 'GRP1' ? '€' : '¤',
          decimals: 2,
          scale: 2,
          rate: { n: 100, d: 1 } // 100:1 ratio to hours
        }
      }
    });
  }),

  // Note: ID in the URL for account usually follows pattern, or we just mock generic response
  http.get(`${ACCOUNTING_URL}/:currency/accounts/:id`, ({ params }) => {
    const { currency, id } = params;
    return HttpResponse.json({
      data: createAccount(id as string, currency as string)
    });
  }),

  // Stats
  http.get(`${ACCOUNTING_URL}/:currency/stats/amount`, () => {
    return HttpResponse.json({
      data: {
        type: 'currency-stats',
        id: faker.string.uuid(),
        attributes: {
          values: [1000, 2000, 1500]
        }
      }
    })
  }),

  http.get(`${ACCOUNTING_URL}/:code/stats/transfers`, ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    return HttpResponse.json({
      data: {
        type: 'transfer-stats',
        id: faker.string.uuid(),
        attributes: {
          from: from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: to || new Date().toISOString(),
          values: [54] // Number of transfers last month
        }
      }
    });
  }),

  http.get(`${ACCOUNTING_URL}/:code/stats/accounts`, ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    return HttpResponse.json({
      data: {
        type: 'account-stats',
        id: faker.string.uuid(),
        attributes: {
          from: from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: to || new Date().toISOString(),
          values: [12] // Number of active accounts last month
        }
      }
    });
  }),

  http.get(`${ACCOUNTING_URL}/:groupCode/transfers`, () => {
    // Generate few transfers
    const transfers = Array.from({ length: 2 }, () => ({
      type: 'transfers',
      id: faker.string.uuid(),
      attributes: {
        amount: faker.number.int({ min: 10, max: 100 }),
        created: faker.date.recent({ days: 15 }).toISOString(),
        state: 'cleared'
      }
    }));
    return HttpResponse.json({ data: transfers });
  })

];
