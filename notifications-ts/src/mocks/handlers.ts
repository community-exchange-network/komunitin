import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { getJwks } from './auth';
import { createGroup, createGroups, createMembers, createPosts, createTransfers, db } from './db';
import { isExpired } from '../clients/komunitin/post';

faker.seed(123);

export const SOCIAL_URL = 'http://social.test';
export const ACCOUNTING_URL = 'http://accounting.test';
export const AUTH_URL = 'http://auth.test';
export const EXTERNAL_URL = 'http://external.test';

// -- Handlers --

export const handlers = [
  // Auth API
  http.post(`${AUTH_URL}/token`, () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'email social:read accounting:read'
    });
  }),

  http.post(`${AUTH_URL}/action-token`, async ({ request }) => {
    const { purpose } = await request.json() as { purpose: string };
    return HttpResponse.json({ token: `mock-${purpose}-token` });
  }),

  http.get(`${AUTH_URL}/.well-known/jwks.json`, () => {
    return HttpResponse.json(getJwks());
  }),

  http.get(`${SOCIAL_URL}/groups`, ({ request }) => {
    createGroups();
    const url = new URL(request.url);
    const status = url.searchParams.get('filter[status]');
    const groups = status
      ? db.groups.filter(group => group.attributes.status === status)
      : db.groups;
    return HttpResponse.json({ data: groups });
  }),

  // Social API
  http.get(`${SOCIAL_URL}/users/:id`, ({ params }) => {
    const { id } = params;
    const user = db.users.find(u => u.id === id);
    if (!user) return new HttpResponse(null, { status: 404 });
    const settings = db.userSettings.find(s => s.id === user.relationships.settings.data.id);
    return HttpResponse.json({ data: user, included: settings ? [settings] : [] });
  }),

  http.get(`${SOCIAL_URL}/users/:id/settings`, ({ params }) => {
    const { id } = params;
    const settings = db.userSettings.find(s => s.id === `${id}-settings`);
    if (!settings) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: settings });
  }),
  
  http.get(`${SOCIAL_URL}/users`, ({ request }) => {
    const url = new URL(request.url);
    const memberFilter = url.searchParams.get('filter[members]');
    
    let users = db.users;
    if (memberFilter) {
        const memberIds = memberFilter.split(',');
        const userIds = db.members
          .filter(member => memberIds.includes(member.id))
          .map(member => member.relationships.user.data.id);
        users = users.filter(user => userIds.includes(user.id));
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
    // Block the group path if requested by a test (simulates inaccessible external group)
    if (db.blockedPaths.has(groupCode as string)) {
      return HttpResponse.json(null, { status: 404 });
    }
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

  http.get(`${SOCIAL_URL}/:groupCode/admins`, ({ params }) => {
    const { groupCode } = params;
    createGroup(groupCode as string);
    const group = db.groups.find(g => g.attributes.code === groupCode);
    const adminIds = db.groupAdmins
      .filter(admin => admin.groupId === group?.id)
      .map(admin => admin.userId);
    return HttpResponse.json({
      data: db.users.filter(user => adminIds.includes(user.id)),
    });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/members`, ({ params, request }) => {
    const { groupCode } = params;
    createMembers(groupCode as string);
    
    const groupId = `group-${groupCode}`;
    const url = new URL(request.url);
    const accountFilter = url.searchParams.get('filter[account]');
    const createdGt = url.searchParams.get('filter[created][gt]');
    const status = url.searchParams.get('filter[status]');

    let members = db.members.filter(m => m.relationships.group.data.id === groupId);

    if (accountFilter) {
      const accounts = accountFilter.split(',');
      members = members.filter(m => accounts.includes(m.relationships.account.data.id));
    }
    
    if (createdGt) {
        members = members.filter(m => new Date(m.attributes.created) > new Date(createdGt));
    }
    if (status) {
      members = members.filter(m => m.attributes.status === status);
    }
    
    return HttpResponse.json({ data: members });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/members/:id`, ({ params }) => {
    const { groupCode, id } = params;
    createMembers(groupCode as string);
    const member = db.members.find(m => m.id === id);
    if (!member) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: member });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/posts`, ({ params, request }) => {
    const { groupCode } = params;
    createPosts('offers', groupCode as string);
    createPosts('needs', groupCode as string);
    const groupId = `group-${groupCode}`;

    const url = new URL(request.url);
    const type = url.searchParams.get('filter[type]');
    const createdGt = url.searchParams.get('filter[created][gt]');
    const expireLt = url.searchParams.get('filter[expires][lt]');
    const expireLtTime = expireLt ? new Date(expireLt).getTime() : null;
    const memberFilter = url.searchParams.get('filter[member]');
    const memberIds = memberFilter ? memberFilter.split(',') : null;
    const memberStatusFilter = url.searchParams.get('filter[member.status]');
    const memberStatuses = memberStatusFilter ? memberStatusFilter.split(',') : null;
    const status = url.searchParams.get('filter[status]');
    const expired = url.searchParams.get('filter[expired]');
    let posts = [...db.offers, ...db.needs]
      .filter(post => post.relationships.group.data.id === groupId)
      .filter(post => !type || post.type === type)
      .filter(post => {
        if (!memberIds) return true;
        const memberId = post.relationships?.member?.data?.id;
        return memberId ? memberIds.includes(memberId) : false;
      })
      .filter(post => {
        if (!memberStatuses) return true;
        const memberId = post.relationships?.member?.data?.id;
        const member = db.members.find(item => item.id === memberId);
        return member ? memberStatuses.includes(member.attributes.status) : false;
      })
      .filter(post => !status || post.attributes.status === status)
      .filter(post => !createdGt || new Date(post.attributes.created) > new Date(createdGt))
      .filter(post => {
        if (expireLtTime === null) return true;
        const expires = post.attributes?.expires;
        if (!expires) return false;
        return new Date(expires).getTime() < expireLtTime;
      })
      .filter(post => {
        if (!expired) return true;
        return expired === String(isExpired(post));
      });

    const sort = url.searchParams.get('sort');
    if (sort) {
      const descending = sort.startsWith('-');
      const field = descending ? sort.slice(1) : sort;
      posts = posts.sort((a, b) => {
        const left = new Date(a.attributes[field] ?? 0).getTime();
        const right = new Date(b.attributes[field] ?? 0).getTime();
        return descending ? right - left : left - right;
      });
    }

    return HttpResponse.json({ data: posts });
  }),
  
  

  http.get(`${SOCIAL_URL}/groups/:id`, ({ params }) => {
    const { id } = params;
    createGroups();
    const group = db.groups.find(g => g.id === id || g.attributes.code === id);
    if (!group) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: group });
  }),

  http.get(`${SOCIAL_URL}/:groupCode/posts/:id`, ({ request, params }) => {
    const { groupCode, id } = params;
    createPosts('offers', groupCode as string);
    createPosts('needs', groupCode as string);
    const post = [...db.offers, ...db.needs].find(item => item.id === id);
    if (!post) return new HttpResponse(null, { status: 404 });

    const included: any[] = [];
    const url = new URL(request.url);
    if (url.searchParams.get('include')?.includes('member')) {
      const member = db.members.find(m => m.id === post.relationships.member.data.id);
      if (member) included.push(member);
    }
    return HttpResponse.json({ data: post, included });
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
         db.accounts.find(a => a.id === payerId) || db.externalAccountRefs.find((r: any) => r.id === payerId),
         db.accounts.find(a => a.id === payeeId) || db.externalAccountRefs.find((r: any) => r.id === payeeId),
     ].filter(Boolean);
     
     return HttpResponse.json({ data: transfer, included });
  }),
  
  http.get(`${ACCOUNTING_URL}/:groupCode/transfers`, ({ params, request }) => {
      const { groupCode } = params;
      createTransfers(groupCode as string);
      const state = new URL(request.url).searchParams.get('filter[state]');
      const transfers = db.transfers
        .filter(t => t.id.startsWith(`transfer-${groupCode}`))
        .filter(t => !state || t.attributes.state === state);
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

// Extra handlers for external server (http://external.test)
// These simulate a remote Komunitin instance's accounting API.
export const externalHandlers = [
  http.get(`${EXTERNAL_URL}/:groupCode/accounts/:id`, ({ params }) => {
    const { id } = params;
    const entry = db.externalAccounts.find((a: any) => a.id === id);
    if (!entry) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: entry.data });
  }),

  http.get(`${EXTERNAL_URL}/:groupCode/currency`, ({ params }) => {
    const { groupCode } = params;
    const entry = db.externalCurrencies.find((c: any) => c.groupCode === groupCode);
    if (!entry) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: entry.data });
  }),
];
