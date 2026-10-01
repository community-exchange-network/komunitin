import type { Express } from 'express'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import prisma from '../src/utils/prisma'
import { resetDb, setupTestServer, teardownTestServer } from './helper'

let app: Express
let token: string
const hash = '$S$D.0Je8nMSWL5H2iFL4a28/RH1EZiHy3igDMZT5av0zDqWWF9YXaZ'
const timestamp = '2025-01-01T09:00:00.000Z'
const csv = (id: string, email = 'legacy@example.org', passwordHash = hash, status = 'active') =>
  `id,email,status,passwordHash,createdAt,updatedAt\n${id},${email},${status},${passwordHash},${timestamp},${timestamp}\n`
const importCsv = (body: string, bearer = token) => request(app).post('/migrations/users')
  .set('Authorization', `Bearer ${bearer}`).set('Content-Type', 'text/csv').send(body)

before(async () => { ({ app } = await setupTestServer()) })
after(teardownTestServer)
beforeEach(async () => {
  await resetDb()
  const response = await request(app).post('/token').type('form').send({
    grant_type: 'client_credentials', client_id: 'komunitin-social',
    client_secret: 'komunitin-social-secret', scope: 'accounting:read',
  }).expect(200)
  token = response.body.access_token
})

test('only the Social service credential can import identities', async () => {
  await request(app).post('/migrations/users').type('text/csv').send(csv(randomUUID())).expect(401)
  const other = await request(app).post('/token').type('form').send({
    grant_type: 'client_credentials', client_id: 'komunitin-notifications',
    client_secret: 'replace-this-with-a-secure-password', scope: 'email',
  }).expect(200)
  await importCsv(csv(randomUUID()), other.body.access_token).expect(401)
  await request(app).post('/migrations/users').set('Authorization', `Bearer ${token}`).send({ email: 'x@example.org' }).expect(400)
  assert.equal(await prisma.user.count(), 0)
})

test('imports canonical UUIDs, verified email, historical dates and unchanged Drupal hashes; login upgrades the hash', async () => {
  const id = randomUUID()
  const response = await importCsv(csv(id, ' LEGACY@EXAMPLE.ORG ')).expect(200)
  assert.deepEqual(response.body.users, [{ id, email: 'legacy@example.org', created: true }])
  const user = await prisma.user.findUniqueOrThrow({ where: { id } })
  assert.equal(user.passwordHash, hash)
  assert.equal(user.emailVerified, true)
  assert.equal(user.createdAt.toISOString(), timestamp)
  assert.equal(user.updatedAt.toISOString(), timestamp)
  assert.ok(!JSON.stringify(response.body).includes(hash))
  await request(app).post('/token').type('form').send({
    grant_type: 'password', client_id: 'komunitin-app', username: user.email, password: 'komunitin',
  }).expect(200)
  const upgraded = await prisma.user.findUniqueOrThrow({ where: { id } })
  assert.match(upgraded.passwordHash, /^\$2b\$/)
  await importCsv(csv(id)).expect(200)
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id } }), upgraded)
})

test('reuses existing identities without changing status, verification, password or timestamps', async () => {
  const id = randomUUID()
  await importCsv(csv(id)).expect(200)
  const user = await prisma.user.update({ where: { id }, data: { status: 'disabled', emailVerified: false, passwordHash: '' } })
  const response = await importCsv(csv('', 'legacy@example.org')).expect(200)
  assert.deepEqual(response.body.users, [{ id, email: user.email, created: false }])
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id } }), user)
  await importCsv(csv(randomUUID())).expect(409)
  await importCsv(csv(id, 'different@example.org')).expect(409)
  assert.equal(await prisma.user.count(), 1)
})

for (const [status, body] of [
  ['omitted', 'email\nunknown@example.org\n'],
  ['blank', 'email,status\nunknown@example.org,\n'],
]) {
  test(`defaults ${status} status to active, generates reusable IDs and reports missing credentials`, async () => {
    const response = await importCsv(body).expect(200)
    assert.deepEqual(response.body.warnings, [
      'User unknown@example.org: missing status; created active',
      'User unknown@example.org: no password; password reset required',
    ])
    const id = response.body.users[0].id
    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    assert.equal(user.status, 'active')
    assert.equal(user.passwordHash, '')
    await importCsv(body).expect(200)
    assert.equal(await prisma.user.count(), 1)
  })
}

test('validates the full file before inserts and never echoes malformed credential values', async () => {
  const invalid = 'not-a-hash-secret'
  const result = await importCsv(csv(randomUUID(), 'legacy@example.org', invalid)).expect(400)
  assert.ok(!result.text.includes(invalid))
  await importCsv('email\nuser@example.org\n USER@EXAMPLE.ORG \n').expect(400)
  await importCsv(`email,passwordHash\nuser@example.org,"${hash}`).expect(400)
  await importCsv('email,email\nuser@example.org,user@example.org\n').expect(400)
  await importCsv(csv(randomUUID()).replace(timestamp, '2030-01-01T09:00:00Z')).expect(400)
  assert.equal(await prisma.user.count(), 0)
})
