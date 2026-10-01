import bcrypt from 'bcrypt'
import type { Express } from 'express'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import request from 'supertest'
import { UserStatus } from '../src/users/status'
import prisma from '../src/utils/prisma'
import { resetDb, setupTestServer, teardownTestServer } from './helper'

const drupalPasswords = [
  // Riemann's demo account from /tmp/ices-bundle-smoke/bundles/NET1/users.csv.
  { name: 'NET1 demo password', password: 'komunitin', hash: '$S$D.0Je8nMSWL5H2iFL4a28/RH1EZiHy3igDMZT5av0zDqWWF9YXaZ' },
  // Additional vectors generated with Drupal 7's _password_crypt(), not this verifier.
  { name: 'SHA-512', password: 'password123', hash: '$S$D12345678MbirSOr.JelhFRnjPk/6gSdcnYB3pXLh80Vb7/a1u/b' },
  { name: 'UTF-8', password: 'pässwörd🔑', hash: '$S$C87654321RCzP8PldPoyb1CJXE0zDwzDbKaViLhwj3O5Y4ugb1md' },
  { name: 'short password', password: 'short', hash: '$S$512345678mxYk6N.HivGCh3vADfWvJh/SEhp6WkQmCJneWoF30rv' },
]

let app: Express
const email = 'legacy@example.org'

function login(password: string) {
  return request(app).post('/token').type('form').send({
    grant_type: 'password',
    client_id: 'komunitin-app',
    username: email,
    password,
  })
}

async function storedHash() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  return user.passwordHash
}

before(async () => {
  ;({ app } = await setupTestServer())
})
after(teardownTestServer)
beforeEach(resetDb)

describe('Imported password authentication', () => {
  for (const { name, password, hash } of drupalPasswords) {
    test(`upgrades ${name} to bcrypt only after successful login`, async () => {
      await prisma.user.create({ data: { email, passwordHash: hash, emailVerified: true } })

      const rejected = await login(`${password}-wrong`).expect(400)
      assert.equal(rejected.body.error, 'invalid_grant')
      assert.equal(await storedHash(), hash)

      const accepted = await login(password).expect(200)
      assert.ok(accepted.body.access_token)
      const upgraded = await storedHash()
      assert.match(upgraded, /^\$2b\$10\$/)
      assert.ok(await bcrypt.compare(password, upgraded))

      await login(password).expect(200)
      assert.equal(await storedHash(), upgraded)
      const wrongAgain = await login(`${password}-wrong`).expect(400)
      assert.equal(wrongAgain.body.error, 'invalid_grant')
    })
  }

  for (const account of [
    { name: 'disabled', status: UserStatus.Disabled, emailVerified: true },
    { name: 'unverified', status: UserStatus.Active, emailVerified: false },
  ]) {
    test(`does not upgrade a ${account.name} account`, async () => {
      const { password, hash } = drupalPasswords[0]
      await prisma.user.create({ data: {
        email,
        passwordHash: hash,
        status: account.status,
        emailVerified: account.emailVerified,
      } })

      const res = await login(password).expect(400)
      assert.equal(res.body.error, 'invalid_grant')
      assert.equal(await storedHash(), hash)
    })
  }

  test('rejects malformed and unsupported imported hashes without modifying them', async () => {
    const { password, hash } = drupalPasswords[0]
    for (const invalid of [
      '',
      '$S$',
      hash.slice(0, -1),
      hash + '.',
      hash + '\n',
      hash.replace('$S$D', '$S$.'), // Iteration count below Drupal's minimum.
      hash.replace('$S$D', '$S$z'), // Iteration count above Drupal's maximum.
      hash.replace('$S$D', '$S$!'),
      hash.replace('$S$', '$X$'),
      hash.slice(0, -1) + 'é',
      'U' + hash,
      '$P$B12345678yA85LGryg1WiwuKb0i6OY.',
      '$H$912345678Lrh04xNwMv/TYtBZ5zQpW/',
    ]) {
      await prisma.user.upsert({
        where: { email },
        create: { email, passwordHash: invalid, emailVerified: true },
        update: { passwordHash: invalid },
      })
      const res = await login(password).expect(400)
      assert.equal(res.body.error, 'invalid_grant')
      assert.equal(await storedHash(), invalid)
    }
  })
})
