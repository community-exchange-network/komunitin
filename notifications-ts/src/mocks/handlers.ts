import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { getJwks } from './auth';
import { createGroup, createGroups, createMembers, createNeeds, createOffers, createTransfers, db } from './db';

faker.seed(123);

export const SOCIAL_URL = 'http://social.test';
export const ACCOUNTING_URL = 'http://accounting.test';
export const AUTH_URL = 'http://auth.test';

// -- Handlers --

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
    return HttpResponse.json({ code: 'mock-unsubscribe-token' });
  }),

  http.get(`${AUTH_URL}/.well-known/jwks.json`, () => {
    return HttpResponse.json(getJwks());
  }),

  http.get(`${SOCIAL_URL}/groups`, () => {
    createGroups();
    return HttpResponse.json({ data: db.groups });
  }),

  // Social API
  http.get(`${SOCIAL_URL}/users/:id`, ({ params }) => {
    const { id } = params;
    const user = db.users.find(u => u.id === id);
    if (!user) return new HttpResponse(null, { status: 404 });
    const settings = db.userSettings.find(s => s.id === user.relationships.settings.data.id);
    return HttpResponse.json({ data: user, included: settings ? [settings] : [] });
  }),
  
  http.get(`${SOCIAL_URL}/users`, ({ request }) => {
    const url = new URL(request.url);
    const memberFilter = url.searchParams.get('filter[members]');
    
    let users = db.users;
    if (memberFilter) {
        const memberIds = memberFilter.split(',');
        users = users.filter((u: any) => {
            const userMemberIds = u.relationships.members.data.map((r: any) => r.id);
            return userMemberIds.some((id: string) => memberIds.includes(id));
        });
    }
    
    const include = url.searchParams.get('include');
    let included: any[] = [];
    if (include && include.includes('settings')) {
       included = db.userSettings.filter(s => users.some((u: any) => u.relationships.settings.data.id === s.id));
    }
    
    return HttpResponse.json({ data: users, included });
  }),

  http.get(`${SOCIAL_URL}/:groupCode`, ({ params }) => {
    const { groupCode } = params;
    createGroup(groupCode as string);
    let group = db.groups.find(g => g.attributes.code === groupCode);
    
    if (group) return HttpResponse.json({ data: group });
    return new HttpResponse(null, { status: 404 });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/settings`, ({ params }) => {
    const { groupCode } = params;
    createGroup(groupCode as string);
    const group = db.groups.find(g => g.attributes.code === groupCode);
    if (group) {
      const settings = db.groupsSettings.find(s => s.id === group.id);
      return HttpResponse.json({ data: settings });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/members`, ({ params, request }) => {
    const { groupCode } = params;
    createMembers(groupCode as string);
    
    const groupId = `group-${groupCode}`;
    const url = new URL(request.url);
    const accountFilter = url.searchParams.get('filter[account]');

    let members = db.members.filter(m => m.relationships.group.data.id === groupId);

    if (accountFilter) {
      const accounts = accountFilter.split(',');
      members = members.filter(m => accounts.includes(m.relationships.account.data.id));
    }

    return HttpResponse.json({ data: members });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/offers`, ({ params }) => {
    const { groupCode } = params;
    createOffers(groupCode as string);
    const groupId = `group-${groupCode}`;
    const offers = db.offers.filter(o => o.relationships.group.data.id === groupId);
    return HttpResponse.json({ data: offers });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/needs`, ({ params }) => {
    const { groupCode } = params;
    createNeeds(groupCode as string);
    const groupId = `group-${groupCode}`;
    const needs = db.needs.filter(n => n.relationships.group.data.id === groupId);
    return HttpResponse.json({ data: needs });
  }),
  
  

  // Accounting API
  
  http.get(`${ACCOUNTING_URL}/:groupCode/currency`, ({ params }) => {
    const { groupCode } = params;
    createGroup(groupCode as string);
    const currency = db.currencies.find(c => c.attributes.code === `${groupCode}`);
    return HttpResponse.json({ data: currency });
  }),

  http.get(`${ACCOUNTING_URL}/:groupCode/accounts/:id`, ({ params }) => {
    const { groupCode, id } = params;
    createMembers(groupCode as string);
    const account = db.accounts.find(a => a.id === id);
    if (!account) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: account });
  }),

  http.get(`${ACCOUNTING_URL}/:groupCode/accounts`, ({ params }) => {
    const { groupCode } = params;
    createMembers(groupCode as string);
    const currency = db.currencies.find(c => c.attributes.code === `${groupCode}`);
    if (!currency) {
      return new HttpResponse(null, {status: 404 });
    }
    const accounts = db.accounts.filter(a => a.relationships.currency.data.id === currency.id);
    return HttpResponse.json({ data: accounts });
  }),

    

  http.get(`${ACCOUNTING_URL}/:groupCode/transfers/:id`, ({ params }) => {
     const { groupCode, id } = params;
     createTransfers(groupCode as string);
     
     const transfer = db.transfers.find(t => t.id === id);
     if (!transfer) return new HttpResponse(null, { status: 404 });
     
     const payerId = transfer.relationships.payer.data.id;
     const payeeId = transfer.relationships.payee.data.id;
     const included = [
         db.accounts.find(a => a.id === payerId),
         db.accounts.find(a => a.id === payeeId)
     ].filter(Boolean);
     
     return HttpResponse.json({ data: transfer, included });
  }),
  
  http.get(`${ACCOUNTING_URL}/:groupCode/transfers`, ({ params }) => {
      const { groupCode } = params;
      createTransfers(groupCode as string);
      const transfers = db.transfers.filter(t => t.id.startsWith(`transfer-${groupCode}`));
      return HttpResponse.json({ data: transfers });
  }),
  
   // Stats (mocked simply)
  http.get(`${ACCOUNTING_URL}/:groupCode/stats/transfers`, () => {
    return HttpResponse.json({
      data: {
        type: 'transfer-stats',
        id: faker.string.uuid(),
        attributes: {
          from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
          values: [54]
        }
      }
    });
  }),

  http.get(`${ACCOUNTING_URL}/:groupCode/stats/accounts`, () => {
    return HttpResponse.json({
      data: {
        type: 'account-stats',
        id: faker.string.uuid(),
        attributes: {
          from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
          values: [12]
        }
      }
    });
  }),
];

export default handlers;
