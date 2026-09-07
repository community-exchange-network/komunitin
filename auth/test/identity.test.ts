import type { Express } from 'express'
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { config } from '../src/config'
import { hashPassword } from '../src/services/tokens'
import prisma from '../src/utils/prisma'
import { resetDb, setupTestServer, teardownTestServer } from './helper'

let app: Express
const password = 'identity-test-password'
const tokenRequest = (data: Record<string, string>) => request(app).post('/token').type('form').send(data)
const login = (email: string) => tokenRequest({
  client_id: 'komunitin-app', grant_type: 'password', username: email, password,
  scope: 'social:read social:write accounting:read offline_access',
})
const serviceToken = async (client: 'social' | 'notifications') => {
  const response = await tokenRequest({
    client_id: `komunitin-${client}`, grant_type: 'client_credentials', scope: 'accounting:read',
    client_secret: client === 'social' ? config.SOCIAL_CLIENT_SECRET : config.NOTIFICATIONS_CLIENT_SECRET,
  }).expect(200)
  return response.body.access_token as string
}
const seedUser = async (email: string) => prisma.user.create({
  data: { email, emailVerified: true, passwordHash: await hashPassword(password) },
})

before(async () => { app = (await setupTestServer()).app })
after(teardownTestServer)
beforeEach(resetDb)

describe('Identity deletion', () => {
  test('Social deletes credentials, action tokens and refresh sessions idempotently', async () => {
    const user = await seedUser('delete@example.test')
    const other = await seedUser('retain@example.test')
    const session = await login(user.email).expect(200)
    const otherSession = await login(other.email).expect(200)
    const action = await request(app).post('/action-token')
      .auth(await serviceToken('notifications'), { type: 'bearer' })
      .send({ userId: user.id, purpose: 'passwordReset' }).expect(200)
    const social = await serviceToken('social')
    const remove = () => request(app).delete(`/users/${user.id}`).auth(social, { type: 'bearer' })

    await remove().expect(204)
    await remove().expect(204)
    assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null)
    await login(user.email).expect(400)
    await tokenRequest({ client_id: 'komunitin-app', grant_type: 'refresh_token', refresh_token: session.body.refresh_token }).expect(400)
    await request(app).post('/change-password').send({ token: action.body.token, password: 'replacement-password' }).expect(400)
    await login(other.email).expect(200)
    await tokenRequest({ client_id: 'komunitin-app', grant_type: 'refresh_token', refresh_token: otherSession.body.refresh_token }).expect(200)
    await request(app).delete('/users/not-a-uuid').auth(social, { type: 'bearer' }).expect(400)
  })

  test('rejects anonymous, app, other service, and delegated Social credentials', async () => {
    const user = await seedUser('protected@example.test')
    const session = await login(user.email).expect(200)
    const delegated = await tokenRequest({
      client_id: 'komunitin-social', client_secret: config.SOCIAL_CLIENT_SECRET,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token: session.body.access_token, scope: 'accounting:read',
    }).expect(200)
    await request(app).delete(`/users/${user.id}`).expect(401)
    for (const token of ['invalid', session.body.access_token, await serviceToken('notifications'), delegated.body.access_token]) {
      await request(app).delete(`/users/${user.id}`).auth(token, { type: 'bearer' }).expect(401)
    }
    await login(user.email).expect(200)
  })
})
