import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import { writeToString } from '@fast-csv/format'
import request from 'supertest'
import { setupServerTest } from './setup'
import { token } from './auth.mock'
import { Scope } from '../../src/server/auth'
import { systemContext } from '../../src/utils/context'
import type { CurrencyControllerImpl } from '../../src/controller/currency-controller'
import { Keypair } from '@stellar/stellar-sdk'
import type { StellarCurrency } from '../../src/ledger/stellar/currency'
import { clearDb } from './db'

/** Replace selected cells while retaining the example's other columns and CSV quoting. */
const withCsvValues = async (csv: string, values: Record<string, string>[]) => {
  const rows = parse(csv, { columns: true }) as Record<string, string>[]
  return writeToString(rows.map((row, index) => ({ ...row, ...values[index] })), { headers: true })
}

describe('Accounting CSV migration API', () => {
  const t = setupServerTest(false)
  const alice = randomUUID()
  const bob = randomUUID()
  let id: string
  const contentType = 'application/vnd.komunitin.migration+json'
  const fixture = async () => ({
    files: Object.fromEntries(await Promise.all(['currency.csv', 'accounts.csv', 'transfers.csv'].map(async name =>
      [name, await readFile(new URL(`../../../shared/migration/example/${name}`, import.meta.url), 'utf8')] as const))),
    users: [{ id: alice, email: 'alice@example.org' }, { id: bob, email: 'bob@example.org' }],
    members: [
      { code: 'EXMP0001', status: 'active', users: ['alice@example.org'] },
      { code: 'EXMP0002', status: 'disabled', users: ['bob@example.org'] },
    ],
  })
  const credentials = () => token('komunitin-social', [Scope.AccountingRead, Scope.AccountingWrite], undefined, 'komunitin-social')
  const start = async (input: unknown, status = 200) => request(t.app).post('/migrations')
    .set('Authorization', `Bearer ${await credentials()}`).set('Content-Type', contentType).set('Accept', 'text/event-stream')
    .send(JSON.stringify(input)).buffer(true).timeout(180_000).expect(status)
  const finish = async (stream: Awaited<ReturnType<typeof start>>, status = 'completed') => {
    const migrationId = stream.headers['x-migration-id']
    assert.match(stream.headers['content-type'], /text\/event-stream/)
    assert.ok(stream.text.startsWith(`event: migration\ndata: ${JSON.stringify({ id: migrationId })}\n\n`))
    assert.ok(stream.text.endsWith(`event: end\ndata: ${JSON.stringify({ id: migrationId, status })}\n\n`), stream.text)
    const result = await request(t.app).get(`/migrations/${migrationId}`)
      .set('Authorization', `Bearer ${await credentials()}`).expect(200)
    assert.equal(result.body.data.attributes.status, status, stream.text)
    const logs = stream.text.split('\n\n').filter(event => event.startsWith('event: progress\ndata: '))
      .map(event => JSON.parse(event.slice('event: progress\ndata: '.length)))
    assert.ok(logs.length > 0)
    assert.deepEqual(result.body.meta.logs, [])
    const stored = await t.app.komunitin.service.privilegedDb().migration.findUniqueOrThrow({ where: { id: migrationId } })
    assert.equal(stored.log, null, 'New progress is streamed without persisting in Accounting')
    return { data: result.body.data, logs }
  }

  it('accepts only the Social service with the write scope, before parsing the upload', async () => {
    await request(t.app).post('/migrations').set('Content-Type', contentType).send('invalid').expect(401)
    for (const [subject, client, scopes] of [
      ['superadmin', undefined, [Scope.Superadmin, Scope.AccountingWrite]],
      ['komunitin-accounting', 'komunitin-accounting', [Scope.AccountingWrite]],
      ['komunitin-social', 'komunitin-social', [Scope.AccountingRead]],
    ] as const) {
      await request(t.app).post('/migrations')
        .set('Authorization', `Bearer ${await token(subject, [...scopes], undefined, client)}`)
        .set('Content-Type', contentType).send('invalid').expect(403)
    }
  })

  it('rejects invalid accounting CSVs, incomplete histories and insufficient limits before writes', async () => {
    const original = await fixture()
    const duplicate = Keypair.random().secret()
    for (const changes of [
      { 'currency.csv': 'code\nEXMP\n' },
      { 'accounts.csv': original.files['accounts.csv'].replace('-5.00', '-6.00') },
      { 'accounts.csv': original.files['accounts.csv'].replace('-5.00,100.00', '-5.00,1.00') },
      { 'accounts.csv': original.files['accounts.csv'].replace('balance,', 'balnce,') },
      { 'transfers.csv': original.files['transfers.csv'].replace('5.00,', '0.001,') },
      { 'transfers.csv': 'id,payer,payee,user,amount,description,createdAt,updatedAt\n' },
      { 'accounts.csv': await withCsvValues(original.files['accounts.csv'], [{ stellarSecret: 'S'.repeat(56) }]) },
      { 'accounts.csv': await withCsvValues(original.files['accounts.csv'], [{ stellarSecret: duplicate }, { stellarSecret: duplicate }]) },
      { 'transfers.csv': '' },
    ]) {
      await start({ ...original, files: { ...original.files, ...changes } }, 400)
      assert.equal(await t.app.komunitin.service.privilegedDb().currency.count(), 0)
      assert.equal(await t.app.komunitin.service.privilegedDb().migration.count(), 0)
    }
  })

  it('owns currency settings, account limits, references, timestamps and exact amount validation', async () => {
    const original = await fixture()
    const cases = [
      ['currency.csv', 'scale', ''],
      ['currency.csv', 'decimals', '3'],
      ['currency.csv', 'name', ' '],
      ['currency.csv', 'symbol', '    '],
      ['currency.csv', 'rateNumerator', '0'],
      ['currency.csv', 'createdAt', '2026-01-01T00:00:00Z'],
      ['currency.csv', 'settings.defaultAllowPayments', 'TRUE'],
      ['currency.csv', 'settings.defaultInitialCreditLimit', '-1'],
      ['currency.csv', 'settings.defaultAcceptPaymentsWhitelist', 'EXMP9999'],
      ['currency.csv', 'settings.defaultAcceptPaymentsWhitelist', 'EXMP0001; EXMP0002'],
      ['accounts.csv', 'settings.acceptPaymentsAfter', 'false'],
      ['accounts.csv', 'settings.acceptPaymentsAfter', '-1'],
      ['accounts.csv', 'settings.acceptPaymentsAfter', '01'],
      ['accounts.csv', 'settings.onPaymentCreditLimit', 'false'],
      ['accounts.csv', 'settings.onPaymentCreditLimit', '-1'],
      ['accounts.csv', 'settings.allowPayments', 'TRUE'],
      ['accounts.csv', 'settings.acceptPaymentsWhitelist', 'EXMP9999'],
      ['accounts.csv', 'updatedAt', 'invalid'],
      ['transfers.csv', 'id', 'invalid'],
      ['transfers.csv', 'payer', 'EXMP9999'],
      ['transfers.csv', 'payee', 'EXMP0001'],
      ['transfers.csv', 'user', 'missing@example.org'],
      ['transfers.csv', 'amount', '5e2'],
      ['transfers.csv', 'amount', '+5'],
      ['transfers.csv', 'amount', '0'],
      ['transfers.csv', 'amount', '-5'],
      ['transfers.csv', 'amount', '92233720368547758.08'],
      ['transfers.csv', 'updatedAt', '2020-01-01T00:00:00Z'],
    ] as const
    for (const [file, column, value] of cases) {
      const csv = await withCsvValues(original.files[file], [{ [column]: value }])
      await start({ ...original, files: { ...original.files, [file]: csv } }, 400)
    }
    await start({ ...original, members: original.members.map(member => ({ ...member, status: 'deleted' })) }, 400)
    const maximum = await withCsvValues(original.files['accounts.csv'], [{}, { maximumBalance: '4.99' }])
    await start({ ...original, files: { ...original.files, 'accounts.csv': maximum } }, 400)
    assert.equal(await t.app.komunitin.service.privilegedDb().currency.count(), 0)
    assert.equal(await t.app.komunitin.service.privilegedDb().migration.count(), 0)
  })

  it('imports once under concurrent requests, preserving initiator, UUID and dates in PostgreSQL and Stellar', async (test) => {
    const input = await fixture()
    // The initiator is not currently an owner of the sending account.
    input.files['transfers.csv'] = input.files['transfers.csv'].replace('alice@example.org', 'bob@example.org')
    const ledger = t.app.komunitin.service.ledger
    const createCurrency = ledger.createCurrency.bind(ledger)
    let entered!: () => void
    let release!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const blocked = test.mock.method(ledger, 'createCurrency', async (...args: Parameters<typeof createCurrency>) => {
      entered()
      await gate
      return createCurrency(...args)
    })
    const running = start(input)
    await ready
    try {
      const concurrent = await start(input, 400)
      assert.match(concurrent.body.errors[0].detail, /already has a running accounting migration/)
    } finally {
      release()
    }
    const accepted = await running
    blocked.mock.restore()
    id = accepted.headers['x-migration-id']
    const completed = await finish(accepted)
    assert.equal(completed.data.attributes.kind, 'csv-accounting')
    assert.ok(!JSON.stringify(completed).includes('files'))
    const db = t.app.komunitin.service.tenantDb('EXMP')
    const accounts = await db.account.findMany({ where: { kind: 'user' }, orderBy: { code: 'asc' } })
    assert.deepEqual(accounts.map(account => [account.code, account.balance, account.creditLimit, account.status]), [
      ['EXMP0001', -500n, 10000n, 'active'], ['EXMP0002', 500n, 10000n, 'disabled'],
    ])
    assert.equal(accounts[0].created.toISOString(), '2025-01-01T09:10:00.000Z')
    assert.equal(accounts[0].updated.toISOString(), '2025-02-01T12:00:00.000Z')
    const transfers = await db.transfer.findMany()
    assert.equal(transfers.length, 1)
    assert.equal(transfers[0].id, '123e4567-e89b-42d3-a456-426614174000')
    assert.equal(transfers[0].amount, 500n)
    assert.equal(transfers[0].userId, bob)
    assert.equal(transfers[0].hash, null)
    assert.equal(transfers[0].state, 'committed')
    const controller = await t.app.komunitin.service.getCurrencyController('EXMP') as CurrencyControllerImpl
    const currency = await controller.getCurrency(systemContext())
    assert.equal((await controller.ledger.getAccount(accounts[0].keyId)).balance(), '95.0000000')
    assert.equal((await controller.ledger.getAccount(currency.keys.disabledAccountsPool!)).balance(), '105.0000000')
    const retry = await start(input)
    assert.equal(retry.headers['x-migration-id'], id)
    assert.equal((await finish(retry)).logs[0].message, 'Accounting migration already completed')
    assert.deepEqual(await db.account.findMany({ where: { kind: 'user' }, orderBy: { code: 'asc' } }), accounts)
    assert.equal(await db.transfer.count(), 1)
    assert.equal((await controller.ledger.getAccount(currency.keys.disabledAccountsPool!)).balance(), '105.0000000')
    await start(await fixture(), 400)
  })

  it('matches existing history without UUIDs and preserves records with or without Stellar keys', async () => {
    const db = t.app.komunitin.service.tenantDb('EXMP')
    const before = {
      currency: await db.currency.findUniqueOrThrow({ where: { code: 'EXMP' } }),
      accounts: await db.account.findMany({ orderBy: { code: 'asc' } }),
      transfers: await db.transfer.findMany(),
    }
    const input = await fixture()
    input.files['transfers.csv'] = await withCsvValues(input.files['transfers.csv'], [{ id: '', user: 'bob@example.org' }])
    await finish(await start(input))
    await finish(await start({ ...input, files: {
      'currency.csv': 'code\nEXMP\n',
      'accounts.csv': 'code\nEXMP0001\nEXMP0002\n',
    } }))
    const controller = await t.app.komunitin.service.getCurrencyController('EXMP')
    const account = before.accounts.find(account => account.code === 'EXMP0001')!
    const key = await controller.keys.retrieveKey(account.keyId)
    input.files['accounts.csv'] = await withCsvValues(input.files['accounts.csv'], [{ stellarSecret: key.secret() }])
    await finish(await start(input))
    assert.deepEqual({
      currency: await db.currency.findUniqueOrThrow({ where: { code: 'EXMP' } }),
      accounts: await db.account.findMany({ orderBy: { code: 'asc' } }),
      transfers: await db.transfer.findMany(),
    }, before)
  })

  it('keeps historical migration records and logs readable and prevents legacy execution', async () => {
    const legacy = await t.app.komunitin.service.tenantDb('OLDX').migration.create({ data: {
      code: 'OLDX', name: 'Historical ICES import', kind: 'integralces-accounting', status: 'completed',
      data: { step: 'end' }, log: [{ time: '2025-01-01T00:00:00Z', level: 'info', step: 'end', message: 'Historical log' }],
    } })
    const auth = { user: 'superadmin', scopes: [Scope.Superadmin] }
    const result = await t.api.get(`/migrations/${legacy.id}`, auth)
    assert.equal(result.body.data.attributes.kind, 'integralces-accounting')
    assert.equal(result.body.meta.logs[0].message, 'Historical log')
    const list = await t.api.get('/migrations', auth)
    assert.ok(list.body.data.some((entry: { id: string }) => entry.id === legacy.id))
    await request(t.app).post(`/migrations/${legacy.id}/play`).expect(404)
    await request(t.app).patch(`/migrations/${legacy.id}`).expect(404)
    await request(t.app).delete(`/migrations/${legacy.id}`).expect(404)
    await request(t.app).get(`/migrations/${legacy.id}/logs/stream`).expect(404)
    await request(t.app).get(`/migrations/${legacy.id}`)
      .set('Authorization', `Bearer ${await token('alice', [Scope.AccountingRead])}`).expect(403)
    const serviceRead = await request(t.app).get(`/migrations/${legacy.id}`)
      .set('Authorization', `Bearer ${await credentials()}`).expect(200)
    assert.deepEqual(serviceRead.body, result.body)
    await request(t.app).get(`/migrations/${randomUUID()}/logs/stream`)
      .set('Authorization', `Bearer ${await credentials()}`).expect(404)
    assert.deepEqual(await t.app.komunitin.service.privilegedDb().migration.findUnique({ where: { id: legacy.id } }), legacy)
  })

  it('resumes after ledger provisioning succeeds but the worker loses its response', async (test) => {
    const input = await fixture()
    input.files = Object.fromEntries(Object.entries(input.files).map(([name, csv]) => [name, csv.replaceAll('EXMP', 'RTRY')]))
    input.members = input.members.map(member => ({ ...member, code: member.code.replace('EXMP', 'RTRY') }))
    input.users = input.users.map(user => ({ ...user, id: randomUUID() }))
    input.files['currency.csv'] = await withCsvValues(input.files['currency.csv'], [{ createdAt: '', updatedAt: '' }])
    const service = t.app.komunitin.service
    const createCurrency = service.ledger.createCurrency.bind(service.ledger)
    const failure = test.mock.method(service.ledger, 'createCurrency', async (...args: Parameters<typeof createCurrency>) => {
      await createCurrency(...args)
      throw new Error('Simulated lost response after provisioning')
    })
    const accepted = await start(input)
    const migrationId = accepted.headers['x-migration-id']
    const failed = await finish(accepted, 'failed')
    assert.equal(failed.logs.at(-1).level, 'error')
    assert.equal(await service.tenantDb('RTRY').currency.count(), 0)
    const checkpoint = await service.tenantDb('RTRY').migration.findUniqueOrThrow({ where: { id: migrationId } })
    const createdAt = (checkpoint.data as { bundle: { currency: { createdAt: string } } }).bundle.currency.createdAt
    failure.mock.restore()
    const retry = await start(input)
    assert.equal(retry.headers['x-migration-id'], migrationId)
    await finish(retry)
    assert.equal((await service.tenantDb('RTRY').currency.findUniqueOrThrow({ where: { code: 'RTRY' } })).created.toISOString(), createdAt)
    assert.equal(await service.tenantDb('RTRY').transfer.count(), 1)
  })

  it('creates with supplied keys, adopts matching Stellar accounts and reconciles drift after database resets', async () => {
    const input = await fixture()
    input.files = Object.fromEntries(Object.entries(input.files).map(([name, csv]) => [name, csv.replaceAll('EXMP', 'KEYS')]))
    input.members = input.members.map(member => ({ ...member, code: member.code.replace('EXMP', 'KEYS') }))
    input.users = input.users.map(user => ({ ...user, id: randomUUID() }))
    const currencySecrets = Object.fromEntries([
      'stellarIssuerSecret', 'stellarCreditSecret', 'stellarAdminSecret', 'stellarExternalIssuerSecret',
      'stellarExternalTraderSecret', 'stellarDisabledAccountsPoolSecret',
    ].map(column => [column, Keypair.random().secret()]))
    const accountSecrets = [Keypair.random().secret(), Keypair.random().secret()]
    input.files['currency.csv'] = await withCsvValues(input.files['currency.csv'], [currencySecrets])
    input.files['accounts.csv'] = await withCsvValues(input.files['accounts.csv'], accountSecrets.map(stellarSecret => ({ stellarSecret, maximumBalance: '10.00' })))
    const importBundle = async () => finish(await start(input))
    await importBundle()
    const service = t.app.komunitin.service
    const controller = await service.getCurrencyController('KEYS') as CurrencyControllerImpl
    const ledger = controller.ledger as StellarCurrency
    const accountKey = Keypair.fromSecret(accountSecrets[0]).publicKey()
    const disabledKey = Keypair.fromSecret(accountSecrets[1]).publicKey()
    const poolKey = Keypair.fromSecret(currencySecrets.stellarDisabledAccountsPoolSecret).publicKey()
    const publicKeys = [...Object.values(currencySecrets).map(secret => Keypair.fromSecret(secret).publicKey()), accountKey]
    const sequences = () => Promise.all(publicKeys.map(async key => (await ledger.ledger.loadAccount(key)).sequence))
    const assertState = async () => {
      const db = service.tenantDb('KEYS')
      const accounts = await db.account.findMany({ where: { kind: 'user' }, orderBy: { code: 'asc' } })
      assert.deepEqual(accounts.map(account => [account.keyId, account.balance, account.status]), [
        [accountKey, -500n, 'active'], [disabledKey, 500n, 'disabled'],
      ])
      assert.equal((await ledger.getAccount(accountKey)).balance(), '95.0000000')
      assert.equal((await ledger.getAccount(accountKey)).maximumBalance(), '110.0000000')
      assert.equal(await ledger.findAccount(disabledKey), null)
      assert.equal((await ledger.getAccount(poolKey)).balance(), '105.0000000')
      assert.equal(await db.transfer.count(), 1)
      const serialized = JSON.stringify(await db.migration.findMany()) + JSON.stringify(await db.encryptedSecret.findMany())
      for (const secret of [...Object.values(currencySecrets), ...accountSecrets]) assert.ok(!serialized.includes(secret))
      const restored = await service.getCurrencyController('KEYS') as CurrencyControllerImpl
      assert.equal((await restored.keys.retrieveKey(accountKey)).secret(), accountSecrets[0])
    }
    await assertState()
    const before = await sequences()
    await clearDb()
    await importBundle()
    await assertState()
    assert.deepEqual(await sequences(), before, 'Matching accounts must not submit ledger transactions')

    // The active account needs a decrease, while the disabled pool needs an increase.
    const sponsor = await controller.keys.sponsorKey()
    await (await ledger.getAccount(controller.model.keys.issuer)).pay({ payeePublicKey: accountKey, amount: '10' }, {
      account: Keypair.fromSecret(currencySecrets.stellarIssuerSecret), sponsor,
    })
    await (await ledger.getAccount(poolKey)).pay({ payeePublicKey: controller.model.keys.issuer, amount: '3' }, {
      account: Keypair.fromSecret(currencySecrets.stellarDisabledAccountsPoolSecret), sponsor,
    })
    await clearDb()
    const completed = await importBundle()
    assert.equal(completed.logs.filter((entry: { message: string }) => entry.message.startsWith('Adjusted Stellar account')).length, 2)
    await assertState()
    const reconciled = await sequences()
    await importBundle()
    assert.deepEqual(await sequences(), reconciled, 'A completed migration remains idempotent')

    // Reconcile in the opposite direction and raise a trustline that is below the target.
    const active = await ledger.getAccount(accountKey)
    await active.pay({ payeePublicKey: controller.model.keys.issuer, amount: '5' }, {
      account: Keypair.fromSecret(accountSecrets[0]), sponsor,
    })
    await active.updateMaximumBalance('90', { account: Keypair.fromSecret(accountSecrets[0]), sponsor })
    await (await ledger.getAccount(controller.model.keys.issuer)).pay({ payeePublicKey: poolKey, amount: '2' }, {
      account: Keypair.fromSecret(currencySecrets.stellarIssuerSecret), sponsor,
    })
    // A missing infrastructure account is recreated with the same key.
    await (await ledger.getAccount(controller.model.keys.admin)).delete({
      admin: Keypair.fromSecret(currencySecrets.stellarAdminSecret), sponsor,
    })
    await clearDb()
    await importBundle()
    await assertState()
    const restored = await sequences()

    const invalid = { ...input, files: { ...input.files, 'accounts.csv': await withCsvValues(input.files['accounts.csv'], [{ balance: '-6.00' }]) } }
    await start(invalid, 400)
    assert.deepEqual(await sequences(), restored, 'History mismatches must fail before ledger writes')
    const conflicting = { ...input, files: { ...input.files, 'accounts.csv': await withCsvValues(input.files['accounts.csv'], [{ stellarSecret: Keypair.random().secret() }]) } }
    await start(conflicting, 400)
  })
})
