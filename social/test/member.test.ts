import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { tenantDb } from '../src/server/multitenant'
import prisma from '../src/utils/prisma'
import { Scope } from '../src/server/context'
import { auth, serviceAuth } from './mocks/auth'
import {
  getAccountingRequestPaths,
  getNotificationsEvents,
  resetMockState,
  seedAccountingAccount,
  seedAccountingCurrency,
  setAccountingAccountDeleteStatus,
} from './mocks/handlers'
import { resetDb, seedGroup, seedGroupAdmin, seedMember, seedMemberUser, seedPost } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { toUuid } from './mocks/utils'

let app: any
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=',
  'base64',
)

before(async () => {
  const server = await setupTestServer()
  app = server.app
})

after(async () => {
  await teardownTestServer()
})

describe('Members endpoints', () => {
  beforeEach(async () => {
    await resetDb()
    resetMockState()
  })

  test('POST /:code/members requires JWT', async () => {
    await seedGroup({ tenantId: 'members-auth', status: 'active', access: 'public' })

    await request(app)
      .post('/members-auth/members')
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'New Member',
          },
        },
      })
      .expect(401)
  })

  test('POST /:code/members creates draft member linked to authenticated user', async () => {
    const group = await seedGroup({ tenantId: 'members-create', status: 'active', access: 'public' })
    const user = await auth('member-create-user')

    const res = await request(app)
      .post('/members-create/members')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Alice Member',
            description: 'Member description',
          },
        },
      })
      .expect(201)

    assert.strictEqual(res.body.data.type, 'members')
    assert.strictEqual(res.body.data.attributes.name, 'Alice Member')
    assert.strictEqual(res.body.data.attributes.status, 'draft')
    assert.strictEqual(res.body.data.attributes.code, 'members-create0000')
    assert.strictEqual(res.body.data.relationships.group.data.id, group.id)

    const list = await request(app)
      .get('/members-create/members')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200)

    assert.strictEqual(list.body.data.length, 0)

    const draftList = await request(app)
      .get('/members-create/members?filter[status]=draft')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200)

    assert.strictEqual(draftList.body.data.length, 1)
    assert.strictEqual(draftList.body.data[0].attributes.name, 'Alice Member')
  })

  test('POST /:code/members accepts explicit code only if admin', async () => {
    await seedGroup({ tenantId: 'members-create-code', status: 'active', access: 'public' })
    const user = await auth('member-create-code-user')
    const admin = await auth('member-create-code-admin')
    await seedGroupAdmin({ tenantId: 'members-create-code', userId: admin.id })

    const data = {
        data: {
          type: 'members',
          attributes: {
            code: 'custom-member',
            name: 'Custom Member',
          },
        },
      }

    await request(app)
      .post('/members-create-code/members')
      .set('Authorization', `Bearer ${user.token}`)
      .send(data)
      .expect(400)
    
    const adminRes = await request(app)
      .post('/members-create-code/members')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(data)
      .expect(201)

    assert.strictEqual(adminRes.body.data.attributes.code, 'custom-member')
  })

  test('GET /:code/members returns only active public members to anonymous users', async () => {
    const group = await seedGroup({ tenantId: 'members-list-anon', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-list-anon', code: 'public-active', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-list-anon', code: 'group-active', status: 'active', access: 'group' })
    await seedMember({ tenantId: 'members-list-anon', code: 'public-pending', status: 'pending', access: 'public' })

    const res = await request(app)
      .get('/members-list-anon/members')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'public-active')
    assert.strictEqual(res.body.data[0].relationships.group.data.id, group.id)
  })

  test('inactive memberships do not grant restricted member-list access', async () => {
    await seedGroup({
      tenantId: 'members-draft-access',
      status: 'active',
      access: 'public',
      settings: { allowAnonymousMemberList: false },
    })
    const user = await auth('members-draft-access-user')
    let draftId = ''
    for (const status of ['draft', 'pending', 'disabled', 'suspended'] as const) {
      const member = await seedMember({
        tenantId: 'members-draft-access',
        code: `member-${status}`,
        status,
        access: 'private',
        userId: user.id,
      })
      if (status === 'draft') {
        draftId = member.id
      }
    }

    await request(app)
      .get('/members-draft-access/members?filter[status]=draft,pending,disabled,suspended')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403)

    await request(app)
      .get(`/members-draft-access/members/${draftId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200)
  })

  test('GET /:code/members?include=account includes external account references', async () => {
    const accountId = toUuid('members-include-account-public-active')
    await seedGroup({ tenantId: 'members-include-account', status: 'active', access: 'public' })
    await seedMember({
      tenantId: 'members-include-account',
      code: 'public-active',
      status: 'active',
      access: 'public',
      accountId,
    })

    const res = await request(app)
      .get('/members-include-account/members?include=account')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].relationships.account.data.type, 'accounts')
    assert.strictEqual(res.body.data[0].relationships.account.data.id, accountId)
    assert.strictEqual(res.body.data[0].relationships.account.data.meta.external, true)
    assert.strictEqual(res.body.data[0].relationships.account.data.meta.href, `http://localhost:2025/members-include-account/accounts/${accountId}`)

    assert.ok(Array.isArray(res.body.included))
    assert.strictEqual(res.body.included.length, 1)
    assert.deepStrictEqual(res.body.included[0], {
      type: 'accounts',
      id: accountId,
      meta: {
        external: true,
        href: `http://localhost:2025/members-include-account/accounts/${accountId}`,
      },
    })
    assert.deepStrictEqual(getAccountingRequestPaths(), [])
  })

  test('GET /:code/members filters by account id', async () => {
    const accountOne = toUuid('members-filter-account-one')
    const accountTwo = toUuid('members-filter-account-two')
    const accountThree = toUuid('members-filter-account-three')
    await seedGroup({ tenantId: 'members-filter-account', status: 'active', access: 'public' })
    await seedMember({
      tenantId: 'members-filter-account',
      code: 'account-one',
      status: 'active',
      access: 'public',
      accountId: accountOne,
    })
    await seedMember({
      tenantId: 'members-filter-account',
      code: 'account-two',
      status: 'active',
      access: 'public',
      accountId: accountTwo,
    })
    await seedMember({
      tenantId: 'members-filter-account',
      code: 'account-three',
      status: 'active',
      access: 'public',
      accountId: accountThree,
    })

    const single = await request(app)
      .get(`/members-filter-account/members?filter[account]=${accountOne}`)
      .expect(200)

    assert.deepStrictEqual(
      single.body.data.map((member: any) => member.attributes.code),
      ['account-one'],
    )

    const multiple = await request(app)
      .get(`/members-filter-account/members?filter[account]=${accountOne},${accountThree}`)
      .expect(200)

    assert.deepStrictEqual(
      multiple.body.data.map((member: any) => member.attributes.code).sort(),
      ['account-one', 'account-three'],
    )
  })

  test('GET /:code/members defaults to active status and still allows owner to request drafts explicitly', async () => {
    await seedGroup({ tenantId: 'members-list-owner', status: 'active', access: 'public' })
    const owner = await auth('member-owner')
    const outsider = await auth('member-outsider')

    await seedMember({
      tenantId: 'members-list-owner',
      code: 'owner-draft',
      status: 'draft',
      access: 'private',
      userId: owner.id,
    })

    const ownerDefaultRes = await request(app)
      .get('/members-list-owner/members')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(ownerDefaultRes.body.data.length, 0)

    const ownerDraftRes = await request(app)
      .get('/members-list-owner/members?filter[status]=draft')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(ownerDraftRes.body.data.length, 1)
    assert.strictEqual(ownerDraftRes.body.data[0].attributes.code, 'owner-draft')

    const outsiderRes = await request(app)
      .get('/members-list-owner/members?filter[status]=draft')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(200)

    assert.strictEqual(outsiderRes.body.data.length, 0)
  })

  test('GET /:code/members returns all members to group admin', async () => {
    await seedGroup({ tenantId: 'members-list-admin', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-list-admin', code: 'draft-one', status: 'draft', access: 'private' })
    await seedMember({ tenantId: 'members-list-admin', code: 'pending-two', status: 'pending', access: 'private' })
    await seedMember({ tenantId: 'members-list-admin', code: 'active-three', status: 'active', access: 'group' })

    const admin = await auth('member-admin')
    await seedGroupAdmin({ tenantId: 'members-list-admin', userId: admin.id })

    const res = await request(app)
      .get('/members-list-admin/members?filter[status]=draft,active,pending')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 3)
  })

  test('GET /:code/members/:member enforces access control', async () => {
    await seedGroup({ tenantId: 'members-get-one', status: 'active', access: 'public' })
    const publicMember = await seedMember({
      tenantId: 'members-get-one',
      code: 'visible',
      status: 'active',
      access: 'public',
    })
    const privateDraft = await seedMember({
      tenantId: 'members-get-one',
      code: 'hidden',
      status: 'draft',
      access: 'private',
    })

    await request(app)
      .get(`/members-get-one/members/${publicMember.id}`)
      .expect(200)

    await request(app)
      .get(`/members-get-one/members/${privateDraft.id}`)
      .expect(403)
  })

  test('member offer and need relationships expose visible published counts', async () => {
    await seedGroup({ tenantId: 'members-post-counts', status: 'active', access: 'public' })
    const member = await seedMember({
      tenantId: 'members-post-counts',
      status: 'active',
      access: 'public',
    })
    await seedPost({
      tenantId: 'members-post-counts',
      memberId: member.id,
      type: 'offers',
      status: 'published',
      access: 'public',
    })
    await seedPost({
      tenantId: 'members-post-counts',
      memberId: member.id,
      type: 'offers',
      status: 'draft',
      access: 'public',
    })

    const res = await request(app)
      .get(`/members-post-counts/members/${member.id}`)
      .expect(200)

    assert.strictEqual(res.body.data.relationships.offers.meta.count, 1)
    assert.strictEqual(res.body.data.relationships.needs.meta.count, 0)
    const related = new URL(res.body.data.relationships.offers.links.related)
    assert.strictEqual(related.searchParams.get('filter[status]'), 'published')
  })

  test('GET /:code/members/:member allows service read access for non-public member', async () => {
    await seedGroup({ tenantId: 'members-read-all-one', status: 'pending', access: 'private' })
    const hiddenMember = await seedMember({
      tenantId: 'members-read-all-one',
      code: 'hidden-member',
      status: 'draft',
      access: 'private',
    })

    const serviceUser = await serviceAuth()
    const res = await request(app)
      .get(`/members-read-all-one/members/${hiddenMember.id}`)
      .set('Authorization', `Bearer ${serviceUser.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.id, hiddenMember.id)
    assert.strictEqual(res.body.data.attributes.code, 'hidden-member')
  })

  test('GET /:code/members allows service read access for non-public members', async () => {
    await seedGroup({ tenantId: 'members-read-all-list', status: 'pending', access: 'private' })
    await seedMember({ tenantId: 'members-read-all-list', code: 'member-a', status: 'draft', access: 'private' })
    await seedMember({ tenantId: 'members-read-all-list', code: 'member-b', status: 'pending', access: 'group' })

    const serviceUser = await serviceAuth()
    const res = await request(app)
      .get('/members-read-all-list/members?filter[status]=draft,pending,active')
      .set('Authorization', `Bearer ${serviceUser.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 2)
    const codes = res.body.data.map((item: any) => item.attributes.code)
    assert.strictEqual(codes.includes('member-a'), true)
    assert.strictEqual(codes.includes('member-b'), true)
  })

  test('PATCH /:code/members/:member allows member user to update attributes', async () => {
    await seedGroup({ tenantId: 'members-patch-owner', status: 'active', access: 'public' })
    const owner = await auth('member-patch-owner')
    const member = await seedMember({
      tenantId: 'members-patch-owner',
      code: 'patch-owner',
      status: 'draft',
      access: 'private',
      userId: owner.id,
    })

    const res = await request(app)
      .patch(`/members-patch-owner/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Updated Member',
            description: 'Updated description',
          },
        },
      })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.name, 'Updated Member')
    assert.strictEqual(res.body.data.attributes.description, 'Updated description')
  })

  test('PATCH /:code/members/:member allows draft to pending by owner', async () => {
    await seedGroup({ tenantId: 'members-submit', status: 'active', access: 'public' })
    const owner = await auth('member-submit-owner')
    const member = await seedMember({
      tenantId: 'members-submit',
      code: 'submit-me',
      status: 'draft',
      userId: owner.id,
    })

    const res = await request(app)
      .patch(`/members-submit/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'pending',
          },
        },
      })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.status, 'pending')
    const events = getNotificationsEvents() as any[]
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.attributes.name, 'MemberRequested')
    assert.strictEqual(events[0].data.attributes.code, 'members-submit')
    assert.strictEqual(typeof events[0].data.attributes.data.member, 'string')
  })

  test('PATCH /:code/members/:member allows pending to active by admin only', async () => {
    const currency = seedAccountingCurrency('members-approve')
    await seedGroup({
      tenantId: 'members-approve',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('member-approve-owner')
    const admin = await auth('seed-group-admin-members-approve')

    const member = await seedMember({
      tenantId: 'members-approve',
      code: 'approve-me',
      status: 'pending',
      userId: owner.id,
    })

    await request(app)
      .patch(`/members-approve/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(403)

    const approved = await request(app)
      .patch(`/members-approve/members/${member.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(200)

    assert.strictEqual(approved.body.data.attributes.status, 'active')
    assert.ok(approved.body.data.attributes.accountId)
    assert.strictEqual(approved.body.data.relationships.account.data.type, 'accounts')
    assert.strictEqual(approved.body.data.relationships.account.data.meta.external, true)
    assert.strictEqual(approved.body.data.relationships.account.data.meta.href, `http://localhost:2025/${currency.code}/accounts/${approved.body.data.attributes.accountId}`)
    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      [`GET /${currency.code}/accounts`, `POST /${currency.code}/accounts`],
    )
    const events = getNotificationsEvents() as any[]
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.attributes.name, 'MemberJoined')
    assert.strictEqual(events[0].data.attributes.code, 'members-approve')
  })

  test('PATCH /:code/members/:member adopts existing accounting account by member code', async () => {
    const currency = seedAccountingCurrency('members-adopt')
    await seedGroup({
      tenantId: 'members-adopt',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })

    const owner = await auth('member-adopt-owner')
    const admin = await auth('seed-group-admin-members-adopt')
    const account = seedAccountingAccount(currency.code, 'adopt-me', [owner.id])

    const member = await seedMember({
      tenantId: 'members-adopt',
      code: 'adopt-me',
      status: 'pending',
      userId: owner.id,
    })

    const approved = await request(app)
      .patch(`/members-adopt/members/${member.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(200)

    assert.strictEqual(approved.body.data.attributes.accountId, account.id)
    assert.strictEqual(approved.body.data.relationships.account.data.id, account.id)
    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      [`GET /${currency.code}/accounts`],
    )
  })

  test('PATCH /:code/members/:member allows member admin to disable and reactivate with accounting sync', async () => {
    const currency = seedAccountingCurrency('members-toggle')
    await seedGroup({
      tenantId: 'members-toggle',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })

    const owner = await auth('member-toggle-owner')
    const account = seedAccountingAccount(currency.code, 'toggle-me', [owner.id])
    const member = await seedMember({
      tenantId: 'members-toggle',
      code: 'toggle-me',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    const disabled = await request(app)
      .patch(`/members-toggle/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'disabled',
          },
        },
      })
      .expect(200)

    assert.strictEqual(disabled.body.data.attributes.status, 'disabled')

    const reactivated = await request(app)
      .patch(`/members-toggle/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(200)

    assert.strictEqual(reactivated.body.data.attributes.status, 'active')
    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      [
        `GET /${currency.code}/accounts/${account.id}`,
        `PATCH /${currency.code}/accounts/${account.id}`,
        `GET /${currency.code}/accounts/${account.id}`,
        `PATCH /${currency.code}/accounts/${account.id}`,
      ],
    )
    assert.strictEqual(getNotificationsEvents().length, 0)
  })

  test('PATCH /:code/members/:member allows suspend and resume only by group admin', async () => {
    const currency = seedAccountingCurrency('members-suspend')
    await seedGroup({
      tenantId: 'members-suspend',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })

    const owner = await auth('members-suspend-owner')
    const admin = await auth('seed-group-admin-members-suspend')
    const account = seedAccountingAccount(currency.code, 'suspend-me', [owner.id])
    const member = await seedMember({
      tenantId: 'members-suspend',
      code: 'suspend-me',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    await request(app)
      .patch(`/members-suspend/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'suspended',
          },
        },
      })
      .expect(403)

    const suspended = await request(app)
      .patch(`/members-suspend/members/${member.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'suspended',
          },
        },
      })
      .expect(200)

    assert.strictEqual(suspended.body.data.attributes.status, 'suspended')

    const resumed = await request(app)
      .patch(`/members-suspend/members/${member.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(200)

    assert.strictEqual(resumed.body.data.attributes.status, 'active')
    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      [
        `GET /${currency.code}/accounts/${account.id}`,
        `PATCH /${currency.code}/accounts/${account.id}`,
        `GET /${currency.code}/accounts/${account.id}`,
        `PATCH /${currency.code}/accounts/${account.id}`,
      ],
    )
  })

  test('DELETE /:code/members/:member soft-deletes as member admin after accounting delete', async () => {
    const currency = seedAccountingCurrency('members-delete')
    await seedGroup({
      tenantId: 'members-delete',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-owner')
    const account = seedAccountingAccount(currency.code, 'delete-me', [owner.id])
    const member = await seedMember({
      tenantId: 'members-delete',
      code: 'delete-me',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    await request(app)
      .delete(`/members-delete/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts/${account.id}`,
      `DELETE /${currency.code}/accounts/${account.id}`,
    ])

    await request(app)
      .get(`/members-delete/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404)

    const list = await request(app)
      .get('/members-delete/members?filter[status]=active')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(list.body.data.length, 0)

    const db = tenantDb(prisma, 'members-delete')
    const deleted = await db.member.findUnique({ where: { id: member.id } })
    assert.ok(deleted?.deleted)
    assert.strictEqual(deleted?.status, 'active')
  })

  test('DELETE /:code/members/:member allows group admin to delete another member', async () => {
    const currency = seedAccountingCurrency('members-delete-admin')
    await seedGroup({
      tenantId: 'members-delete-admin',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-admin-owner')
    const admin = await auth('members-delete-admin-admin')
    await seedGroupAdmin({ tenantId: 'members-delete-admin', userId: admin.id })
    const account = seedAccountingAccount(currency.code, 'delete-by-admin', [owner.id])
    const member = await seedMember({
      tenantId: 'members-delete-admin',
      code: 'delete-by-admin',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    await request(app)
      .delete(`/members-delete-admin/members/${member.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts/${account.id}`,
      `DELETE /${currency.code}/accounts/${account.id}`,
    ])
  })

  test('DELETE /:code/members/:member forbids non-writer before accounting delete', async () => {
    const currency = seedAccountingCurrency('members-delete-deny')
    await seedGroup({
      tenantId: 'members-delete-deny',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-deny-owner')
    const outsider = await auth('members-delete-deny-outsider')
    const account = seedAccountingAccount(currency.code, 'delete-denied', [owner.id])
    const member = await seedMember({
      tenantId: 'members-delete-deny',
      code: 'delete-denied',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    await request(app)
      .delete(`/members-delete-deny/members/${member.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    assert.deepStrictEqual(getAccountingRequestPaths(), [])
  })

  test('DELETE /:code/members/:member skips accounting delete when member has no accounting account', async () => {
    await seedGroup({ tenantId: 'members-delete-no-account', status: 'active', access: 'public' })
    const owner = await auth('members-delete-no-account-owner')
    const member = await seedMember({
      tenantId: 'members-delete-no-account',
      status: 'active',
      userId: owner.id,
    })

    await request(app)
      .delete(`/members-delete-no-account/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      'GET /members-delete-no-account/accounts',
    ])

    const db = tenantDb(prisma, 'members-delete-no-account')
    const deleted = await db.member.findUnique({ where: { id: member.id } })
    assert.ok(deleted?.deleted)
  })

  test('DELETE /:code/members/:member deletes accounting account found by member code', async () => {
    const currency = seedAccountingCurrency('members-delete-account-by-code')
    await seedGroup({
      tenantId: 'members-delete-account-by-code',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-account-by-code-owner')
    const account = seedAccountingAccount(currency.code, 'delete-by-code', [owner.id])
    const member = await seedMember({
      tenantId: 'members-delete-account-by-code',
      code: 'delete-by-code',
      status: 'active',
      userId: owner.id,
    })

    await request(app)
      .delete(`/members-delete-account-by-code/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts`,
      `DELETE /${currency.code}/accounts/${account.id}`,
    ])

    const db = tenantDb(prisma, 'members-delete-account-by-code')
    const deleted = await db.member.findUnique({ where: { id: member.id } })
    assert.ok(deleted?.deleted)
  })

  test('DELETE /:code/members/:member returns bad request and keeps social member when accounting account has nonzero balance', async () => {
    const currency = seedAccountingCurrency('members-delete-accounting-400')
    await seedGroup({
      tenantId: 'members-delete-accounting-400',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-accounting-400-owner')
    const account = seedAccountingAccount(currency.code, 'delete-balance', [owner.id])
    account.balance = 10
    const member = await seedMember({
      tenantId: 'members-delete-accounting-400',
      code: 'delete-balance',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    const res = await request(app)
      .delete(`/members-delete-accounting-400/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400)

    assert.strictEqual(res.body.errors[0].code, 'BadRequest')
    assert.strictEqual(res.body.errors[0].detail, 'Account balance must be zero to delete account')
    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts/${account.id}`,
    ])

    const db = tenantDb(prisma, 'members-delete-accounting-400')
    const notDeleted = await db.member.findUnique({ where: { id: member.id } })
    assert.strictEqual(notDeleted?.deleted, null)

    await request(app)
      .get(`/members-delete-accounting-400/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)
  })

  test('DELETE /:code/members/:member returns internal error when accounting delete fails after preflight', async () => {
    const currency = seedAccountingCurrency('members-delete-accounting-500')
    await seedGroup({
      tenantId: 'members-delete-accounting-500',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-accounting-500-owner')
    const account = seedAccountingAccount(currency.code, 'delete-failure', [owner.id])
    const member = await seedMember({
      tenantId: 'members-delete-accounting-500',
      code: 'delete-failure',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })
    setAccountingAccountDeleteStatus(400, 'Mock accounting delete failure')

    const res = await request(app)
      .delete(`/members-delete-accounting-500/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(500)

    assert.strictEqual(res.body.errors[0].code, 'InternalError')
    assert.strictEqual(res.body.errors[0].detail, 'Mock accounting delete failure')
    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts/${account.id}`,
      `DELETE /${currency.code}/accounts/${account.id}`,
    ])

    const db = tenantDb(prisma, 'members-delete-accounting-500')
    const notDeleted = await db.member.findUnique({ where: { id: member.id } })
    assert.strictEqual(notDeleted?.deleted, null)
  })

  test('DELETE /:code/members/:member treats missing accounting account as deleted', async () => {
    const currency = seedAccountingCurrency('members-delete-accounting-404')
    await seedGroup({
      tenantId: 'members-delete-accounting-404',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-accounting-404-owner')
    const member = await seedMember({
      tenantId: 'members-delete-accounting-404',
      code: 'delete-missing-account',
      status: 'active',
      userId: owner.id,
      accountId: toUuid('members-delete-accounting-404-missing'),
    })

    await request(app)
      .delete(`/members-delete-accounting-404/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts/${member.accountId}`,
    ])

    const db = tenantDb(prisma, 'members-delete-accounting-404')
    const deleted = await db.member.findUnique({ where: { id: member.id } })
    assert.ok(deleted?.deleted)
  })

  test('DELETE /:code/members/:member treats already deleted accounting account as deleted', async () => {
    const currency = seedAccountingCurrency('members-delete-account-deleted')
    await seedGroup({
      tenantId: 'members-delete-account-deleted',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const owner = await auth('members-delete-account-deleted-owner')
    const account = seedAccountingAccount(currency.code, 'delete-already-deleted', [owner.id])
    account.status = 'deleted'
    const member = await seedMember({
      tenantId: 'members-delete-account-deleted',
      code: 'delete-already-deleted',
      status: 'active',
      userId: owner.id,
      accountId: account.id,
    })

    await request(app)
      .delete(`/members-delete-account-deleted/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      `GET /${currency.code}/accounts/${member.accountId}`,
    ])

    const db = tenantDb(prisma, 'members-delete-account-deleted')
    const deleted = await db.member.findUnique({ where: { id: member.id } })
    assert.ok(deleted?.deleted)
  })

  test('DELETE /:code/members/:member hides member posts without soft-deleting posts', async () => {
    await seedGroup({ tenantId: 'members-delete-posts', status: 'active', access: 'public' })
    const owner = await auth('members-delete-posts-owner')
    const member = await seedMember({
      tenantId: 'members-delete-posts',
      status: 'active',
      access: 'public',
      userId: owner.id,
    })
    const post = await seedPost({
      tenantId: 'members-delete-posts',
      memberId: member.id,
      type: 'offers',
      status: 'published',
      access: 'public',
    })

    await request(app)
      .get(`/members-delete-posts/posts/${post.id}`)
      .expect(200)

    await request(app)
      .delete(`/members-delete-posts/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204)

    await request(app)
      .get(`/members-delete-posts/posts/${post.id}`)
      .expect(404)

    const list = await request(app)
      .get('/members-delete-posts/posts')
      .expect(200)

    assert.strictEqual(list.body.data.length, 0)

    const db = tenantDb(prisma, 'members-delete-posts')
    const unchangedPost = await db.post.findUnique({ where: { id: post.id } })
    assert.strictEqual(unchangedPost?.deleted, null)
  })

  test('PATCH /:code/members/:member denies non-member and non-admin', async () => {
    await seedGroup({ tenantId: 'members-patch-deny', status: 'active', access: 'public' })
    const owner = await auth('member-patch-owner-deny')
    const outsider = await auth('member-patch-outsider-deny')

    const member = await seedMember({
      tenantId: 'members-patch-deny',
      code: 'deny-me',
      status: 'draft',
      userId: owner.id,
    })

    await request(app)
      .patch(`/members-patch-deny/members/${member.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Should Fail',
          },
        },
      })
      .expect(403)
  })

  test('GET /:code/members supports filtering and sorting', async () => {
    await seedGroup({ tenantId: 'members-query', status: 'active', access: 'public' })
    const admin = await auth('members-query-admin')
    await seedGroupAdmin({ tenantId: 'members-query', userId: admin.id })

    await seedMember({ tenantId: 'members-query', code: 'a', name: 'Alpha', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-query', code: 'b', name: 'Beta', status: 'pending', access: 'private' })
    await seedMember({ tenantId: 'members-query', code: 'c', name: 'Gamma', status: 'draft', access: 'private' })

    const res = await request(app)
      .get('/members-query/members?sort=name&filter[status]=pending')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'b')
  })

  test('GET /:code/members supports admin status/search/sort/page query', async () => {
    await seedGroup({ tenantId: 'members-admin-search-query', status: 'active', access: 'public' })
    const admin = await auth('members-admin-search-query-admin')
    await seedGroupAdmin({ tenantId: 'members-admin-search-query', userId: admin.id })

    await seedMember({ tenantId: 'members-admin-search-query', code: 'disabled-needle', name: 'Alpha Needle', status: 'disabled', access: 'private' })
    await seedMember({ tenantId: 'members-admin-search-query', code: 'suspended-needle', name: 'Bravo Needle', status: 'suspended', access: 'private' })
    await seedMember({ tenantId: 'members-admin-search-query', code: 'active-needle', name: 'Charlie Needle', status: 'active', access: 'private' })
    await seedMember({ tenantId: 'members-admin-search-query', code: 'active-other', name: 'Delta Other', status: 'active', access: 'private' })

    const res = await request(app)
      .get('/members-admin-search-query/members?filter[status]=active,disabled,suspended&sort=name&filter[search]=needle&page[size]=2')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.deepStrictEqual(
      res.body.data.map((member: any) => member.attributes.code),
      ['disabled-needle', 'suspended-needle'],
    )
  })

  test('GET /:code/members supports admin account/status/page query', async () => {
    const accountOne = toUuid('members-admin-account-query-one')
    const accountTwo = toUuid('members-admin-account-query-two')
    const accountThree = toUuid('members-admin-account-query-three')
    await seedGroup({ tenantId: 'members-admin-account-query', status: 'active', access: 'public' })
    const admin = await auth('members-admin-account-query-admin')
    await seedGroupAdmin({ tenantId: 'members-admin-account-query', userId: admin.id })

    await seedMember({ tenantId: 'members-admin-account-query', code: 'active-account', status: 'active', access: 'private', accountId: accountOne })
    await seedMember({ tenantId: 'members-admin-account-query', code: 'disabled-account', status: 'disabled', access: 'private', accountId: accountTwo })
    await seedMember({ tenantId: 'members-admin-account-query', code: 'pending-account', status: 'pending', access: 'private', accountId: accountThree })

    const res = await request(app)
      .get(`/members-admin-account-query/members?filter[account]=${accountOne},${accountTwo}&filter[status]=active,disabled,suspended&page[size]=5`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.deepStrictEqual(
      res.body.data.map((member: any) => member.attributes.code).sort(),
      ['active-account', 'disabled-account'],
    )
  })

  test('GET /:code/members supports search across text and JSON scalar values', async () => {
    await seedGroup({ tenantId: 'members-search', status: 'active', access: 'public' })
    await seedMember({
      tenantId: 'members-search',
      code: 'alpha-code',
      name: 'Alpha Person',
      status: 'active',
      access: 'public',
      address: {
        addressLocality: 'Riverdale',
      },
      contacts: [
        { type: 'email', value: 'alpha@example.org' },
      ],
    })
    await seedMember({
      tenantId: 'members-search',
      code: 'bravo-code',
      name: 'Bravo Person',
      status: 'active',
      access: 'public',
    })

    const byName = await request(app)
      .get('/members-search/members?filter[search]=alpha')
      .expect(200)

    assert.strictEqual(byName.body.data.length, 1)
    assert.strictEqual(byName.body.data[0].attributes.code, 'alpha-code')

    const byAddressValue = await request(app)
      .get('/members-search/members?filter[search]=riverdale')
      .expect(200)

    assert.strictEqual(byAddressValue.body.data.length, 1)
    assert.strictEqual(byAddressValue.body.data[0].attributes.code, 'alpha-code')

    const byAddressKey = await request(app)
      .get('/members-search/members?filter[search]=addressLocality')
      .expect(200)

    assert.strictEqual(byAddressKey.body.data.length, 0)
  })

  test('GET /:code/members paginates after visibility filtering', async () => {
    await seedGroup({ tenantId: 'members-page', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-page', code: 'hidden', name: 'Alpha', status: 'draft', access: 'public' })
    await seedMember({ tenantId: 'members-page', code: 'visible', name: 'Bravo', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/members-page/members?sort=name&page[size]=1')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'visible')
  })

  test('GET /:code/members sorts by distance with null locations last', async () => {
    await seedGroup({ tenantId: 'members-distance', status: 'active', access: 'public' })
    await seedMember({
      tenantId: 'members-distance',
      code: 'near',
      status: 'active',
      access: 'public',
      longitude: 120,
      latitude: 45,
    })
    await seedMember({
      tenantId: 'members-distance',
      code: 'far',
      status: 'active',
      access: 'public',
      longitude: 10,
      latitude: 20,
    })
    await seedMember({
      tenantId: 'members-distance',
      code: 'no-location',
      status: 'active',
      access: 'public',
    })

    const res = await request(app)
      .get('/members-distance/members?near=121,45&sort=distance')
      .expect(200)

    assert.deepStrictEqual(
      res.body.data.map((member: any) => member.attributes.code),
      ['near', 'far', 'no-location'],
    )
  })

  test('PATCH /:code/members/:member returns 404 for unknown id', async () => {
    await seedGroup({ tenantId: 'members-missing', status: 'active', access: 'public' })
    const admin = await auth('members-missing-admin')
    await seedGroupAdmin({ tenantId: 'members-missing', userId: admin.id })
    const missingMemberId = toUuid('members-missing-id')

    await request(app)
      .patch(`/members-missing/members/${missingMemberId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'X',
          },
        },
      })
      .expect(404)
  })

  test('GET /:code/members/:member allows linked secondary member user', async () => {
    await seedGroup({ tenantId: 'members-linked-user', status: 'active', access: 'public' })
    const owner = await auth('members-linked-owner')
    const second = await auth('members-linked-second')
    const outsider = await auth('members-linked-outsider')

    const member = await seedMember({
      tenantId: 'members-linked-user',
      code: 'shared-member',
      status: 'draft',
      access: 'private',
      userId: owner.id,
    })

    await seedMemberUser({
      tenantId: 'members-linked-user',
      memberId: member.id,
      userId: second.id,
      role: 'admin',
    })

    await request(app)
      .get(`/members-linked-user/members/${member.id}`)
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200)

    await request(app)
      .get(`/members-linked-user/members/${member.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)
  })

  test('GET /:code/members/:member?include=group includes group data', async () => {
    await seedGroup({ tenantId: 'members-include-group', name: 'Included Group', status: 'active', access: 'public' })
    const member = await seedMember({
      tenantId: 'members-include-group',
      code: 'member-with-group',
      status: 'active',
      access: 'public',
    })

    const res = await request(app)
      .get(`/members-include-group/members/${member.id}?include=group`)
      .expect(200)

    assert.strictEqual(res.body.data.attributes.code, 'member-with-group')
    assert.strictEqual(res.body.included.length, 1)
    assert.strictEqual(res.body.included[0].type, 'groups')
    assert.strictEqual(res.body.included[0].attributes.code, 'members-include-group')
  })

  test('GET /:code/members?filter[code]=x&include=group returns filtered member with group included', async () => {
    await seedGroup({ tenantId: 'members-filter-include', name: 'Filter Include Group', status: 'active', access: 'public' })
    await seedMember({tenantId: 'members-filter-include', code: 'match', status: 'active', access: 'public' })
    await seedMember({tenantId: 'members-filter-include', code: 'other', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/members-filter-include/members?filter[code]=match&include=group')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'match')
    assert.strictEqual(res.body.included.length, 1)
    assert.strictEqual(res.body.included[0].type, 'groups')
    assert.strictEqual(res.body.included[0].attributes.code, 'members-filter-include')
  })

  test('POST, PATCH and DELETE /:code/members sync member image files by URL', async () => {
    await seedGroup({ tenantId: 'members-files', status: 'active', access: 'public' })
    const user = await auth('members-files-user')
    await seedGroupAdmin({ tenantId: 'members-files', userId: user.id })

    const firstUpload = await request(app)
      .post('/members-files/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'members')
      .attach('file', tinyPng, { filename: 'member-one.png', contentType: 'image/png' })
      .expect(201)

    const secondUpload = await request(app)
      .post('/members-files/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'members')
      .attach('file', tinyPng, { filename: 'member-two.png', contentType: 'image/png' })
      .expect(201)

    const firstUrl = firstUpload.body.data.attributes.url
    const secondUrl = secondUpload.body.data.attributes.url
    const db = tenantDb(prisma, 'members-files')

    const created = await request(app)
      .post('/members-files/members')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Member With Image',
            image: { url: firstUrl, alt: 'Avatar one' },
          },
        },
      })
      .expect(201)

    const memberId = created.body.data.id

    let files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    let fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(firstUrl)?.resourceId, memberId)
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)

    const updated = await request(app)
      .patch(`/members-files/members/${memberId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            image: { url: secondUrl, alt: 'Avatar two' },
          },
        },
      })
      .expect(200)

    assert.strictEqual(updated.body.data.attributes.image.url, secondUrl)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(firstUrl)?.resourceId, null)
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, memberId)

    const cleared = await request(app)
      .patch(`/members-files/members/${memberId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            image: null,
          },
        },
      })
      .expect(200)

    assert.strictEqual(cleared.body.data.attributes.image, null)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)

    await request(app)
      .patch(`/members-files/members/${memberId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            image: { url: secondUrl, alt: 'Image to unlink on delete' },
          },
        },
      })
      .expect(200)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, memberId)

    await request(app)
      .delete(`/members-files/members/${memberId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(204)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)
  })
})
