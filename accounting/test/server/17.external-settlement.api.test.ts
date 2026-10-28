import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { before, describe, it } from "node:test"
import { http, HttpResponse } from "msw"
import request from "supertest"
import { Horizon } from "@stellar/stellar-sdk"
import { config } from "../../src/config"
import { AccountControllerImpl } from "../../src/controller/account-controller"
import { CurrencyControllerImpl } from "../../src/controller/currency-controller"
import { createExternalToken } from "../../src/controller/external-jwt"
import { FullAccount } from "../../src/model"
import { testTransfer } from "./api.data"
import { addHandlers } from "./net.mock"
import { setupServerTest } from "./setup"
import { waitFor } from "./utils"

describe('Verified external settlements', () => {
  const t = setupServerTest()
  const remoteId = randomUUID()
  const href = `https://remote.example/accounts/${remoteId}`
  const controller = async () => await t.app.komunitin.service.getCurrencyController('TEST') as CurrencyControllerImpl
  let response: { state: string, hash?: string } = { state: 'pending' }
  let token: string

  const data = (amount = 100) => {
    const doc = testTransfer(remoteId, t.account1.id, amount, 'External settlement', 'committed')
    Object.assign(doc.data.relationships.payer.data, { meta: { external: true, href } })
    return doc
  }
  const notify = (doc: object, id?: string) => {
    const req = id ? request(t.app).patch(`/TEST/transfers/${id}`) : request(t.app).post('/TEST/transfers')
    return req.set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/vnd.api+json').send(doc)
  }
  const pay = async (amount: number) => {
    const c = await controller()
    const payer = await c.ledger.getAccount(t.account2.attributes.key)
    return await payer.pay({ payeePublicKey: t.account1.attributes.key, amount: c.toStringAmount(amount) }, {
      account: await c.keys.retrieveKey(t.account2.attributes.key), sponsor: await c.keys.sponsorKey()
    })
  }
  const credit = async () => (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data.attributes.creditLimit
  const credited = async (expected: number) => await waitFor(async () => (await credit()) === expected)

  before(async () => {
    const c = await controller()
    token = await createExternalToken(await c.keys.retrieveKey(t.account2.attributes.key))
    await t.api.patch('/TEST/currency/settings', { data: { attributes: {
      enableExternalPaymentRequests: true, defaultAllowExternalPaymentRequests: true,
      defaultOnPaymentCreditLimit: t.account1.attributes.creditLimit + 10000
    } } }, t.admin)
    addHandlers(
      http.get(href, () => HttpResponse.json({ data: { ...t.account2, id: remoteId } })),
      http.get('https://remote.example/currency', () => HttpResponse.json({ data: t.currency })),
      http.post('https://remote.example/transfers', () => HttpResponse.json({ data: {
        type: 'transfers', id: randomUUID(), attributes: response
      } }, { status: 201 }))
    )
  })

  it('verifies immediate completion and uses the ledger amount for credit', async ctx => {
    const initialCredit = await credit()
    const c = await controller()
    // Credit funding is a real ledger payment, but must never count as income.
    const payments = await new Horizon.Server(config.STELLAR_HORIZON_URL).payments()
      .forAccount(t.account1.attributes.key).call()
    const funding = payments.records.find(payment => payment.type === 'payment'
      && payment.from === t.currency.attributes.keys.credit)
    assert.ok(funding)
    const fundingId = randomUUID()
    const fundingHref = `https://remote.example/accounts/${fundingId}`
    addHandlers(http.get(fundingHref, () => HttpResponse.json({ data: {
      ...t.account2, id: fundingId,
      attributes: { ...t.account2.attributes, key: t.currency.attributes.keys.credit }
    } })))
    const forged = data()
    Object.assign(forged.data.relationships.payer.data, { id: fundingId, meta: { external: true, href: fundingHref } })
    response = { state: 'committed', hash: funding.transaction_hash }
    await t.api.post('/TEST/transfers', forged, t.user1, 400)

    response = { state: 'committed' }
    await t.api.post('/TEST/transfers', data(), t.user1, 400)
    assert.equal(await credit(), initialCredit)

    const payment = await pay(10)
    const getTransfer = c.ledger.getTransfer.bind(c.ledger)
    const wrongAsset = ctx.mock.method(c.ledger, 'getTransfer', async (hash: string) => ({
      ...await getTransfer(hash), asset: { code: 'WRONG', issuer: t.currency.attributes.keys.issuer }
    }))
    response = { state: 'committed', hash: payment.hash }
    await t.api.post('/TEST/transfers', data(), t.user1, 400)
    wrongAsset.mock.restore()

    const settled = (await t.api.post('/TEST/transfers', data(), t.user1)).body.data
    assert.equal(settled.attributes.state, 'committed')
    assert.equal(settled.attributes.amount, 10)
    assert.equal(settled.attributes.hash, payment.hash)
    await credited(initialCredit + 10)
  })

  it('saves a single consistent settlement when two pending updates race', async ctx => {
    response = { state: 'pending' }
    const pending = (await t.api.post('/TEST/transfers', data(), t.user1)).body.data
    const initialCredit = await credit()
    const payments = [await pay(10), await pay(20)]
    const c = await controller()
    const getTransfer = c.ledger.getTransfer.bind(c.ledger)
    const updateBalance = AccountControllerImpl.prototype.updateAccountBalance
    let balanceReads = 0
    ctx.mock.method(AccountControllerImpl.prototype, 'updateAccountBalance', async function (this: AccountControllerImpl, account: FullAccount) {
      if (account.id === t.account1.id && ++balanceReads === 2) {
        await waitFor(async () => (await credit()) > initialCredit)
      }
      await updateBalance.call(this, account)
    })
    let release: () => void
    const ready = new Promise<void>(resolve => { release = resolve })
    let arrived = 0
    ctx.mock.method(c.ledger, 'getTransfer', async (hash: string) => {
      const payment = await getTransfer(hash)
      if (++arrived === 2) release()
      await ready
      return payment
    })
    const results = await Promise.all(payments.map(payment => notify({ data: { attributes: {
      state: 'committed', amount: 100, hash: payment.hash
    } } }, pending.id)))
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400])
    const winner = results.findIndex(result => result.status === 200)
    const stored = (await t.api.get(`/TEST/transfers/${pending.id}`, t.user1)).body.data.attributes
    assert.equal(stored.amount, winner === 0 ? 10 : 20)
    assert.equal(stored.hash, payments[winner].hash)
    assert.equal(stored.state, 'committed')
    await credited(initialCredit + stored.amount)
    const account = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data.attributes
    const ledgerAccount = await c.ledger.getAccount(account.key)
    assert.equal(account.balance, c.toIntegerAmount(ledgerAccount.balance()) - account.creditLimit)
  })

  it('stores incoming payment hashes and rejects their reuse', async () => {
    const initialCredit = await credit()
    const payment = await pay(10)
    const doc = data()
    Object.assign(doc.data.attributes, { hash: payment.hash })
    const settled = await notify(doc)
    assert.equal(settled.status, 201, settled.text)
    assert.equal(settled.body.data.attributes.amount, 10)
    assert.equal(settled.body.data.attributes.hash, payment.hash)
    await credited(initialCredit + 10)
    assert.equal((await notify(doc)).status, 400)
    assert.equal(await credit(), initialCredit + 10)
  })

  it('blocks old hashless external proofs while allowing newer payments and imported history', async () => {
    response = { state: 'pending' }
    const old = (await t.api.post('/TEST/transfers', data(), t.user1)).body.data
    const payment = await pay(10)
    const c = await controller()
    await c.db.transfer.update({ where: { tenantId_id: { tenantId: 'TEST', id: old.id } },
      data: { state: 'committed', hash: null, updated: (await c.ledger.getTransfer(payment.hash)).created } })
    const doc = data()
    Object.assign(doc.data.attributes, { hash: payment.hash })
    assert.equal((await notify(doc)).status, 400)

    const fresh = await pay(20)
    // Imported local history also has null hashes, but must not block external settlement.
    const imported = testTransfer(t.account2.id, t.account1.id, 1, 'Imported history', 'new')
    const record = (await t.api.post('/TEST/transfers', imported, t.user2)).body.data
    await c.db.transfer.update({ where: { tenantId_id: { tenantId: 'TEST', id: record.id } },
      data: { state: 'committed', hash: null } })
    Object.assign(doc.data.attributes, { hash: fresh.hash })
    const settled = await notify(doc)
    assert.equal(settled.status, 201, settled.text)
    assert.equal(settled.body.data.attributes.amount, 20)
  })
})
