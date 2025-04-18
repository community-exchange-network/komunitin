import { before, describe, it } from "node:test"
import assert from "node:assert"

import { setupServerTest } from './setup'
import { seedAccounts, seedTransfers } from "./db"

describe('Statistics endpoints', async () => {
  const t = setupServerTest()
  const start = new Date(2024, 0, 1)
  const end = new Date(2024, 11, 31)
  before(async () => {
    // Add some accounts to the DB (without creating ledger accounts)
    await seedAccounts("TEST", 80, start, end)
    // Add some transfers to the DB (without actually performing them in the ledger for speed)
    await seedTransfers("TEST", 1000, start, end)
  })

  it('volume in one month', async () => {
    const response = await t.api.get('/TEST/stats/amount?from=2024-06-01Z&to=2024-07-01Z', t.user1)
    assert.equal(response.body.data.attributes.values.length, 1)
    assert.equal(response.body.data.attributes.values[0], 1868700)
    assert.equal(new Date(response.body.data.attributes.from).toISOString(), new Date("2024-06-01Z").toISOString())
    assert.equal(new Date(response.body.data.attributes.to).toISOString(), new Date("2024-07-01Z").toISOString())
  })

  it('volume all time', async () => {
    const response = await t.api.get('/TEST/stats/amount', t.user1)
    assert.equal(response.body.data.attributes.values.length, 1)
    assert.equal(response.body.data.attributes.values[0], 45743200)
    assert.equal(response.body.data.attributes.from, undefined)
    assert.ok(new Date().getTime() - new Date(response.body.data.attributes.to).getTime() < 1000, "To date should be now")
  })

  it('volume by months across a year', async () => {
    const response = await t.api.get('/TEST/stats/amount?from=2024-01-01Z&to=2025-01-01Z&interval=P1M', t.user1)
    assert.equal(response.body.data.attributes.values.length, 12)
    assert.equal(response.body.data.attributes.values[5], 1868700)
    assert.equal(new Date(response.body.data.attributes.from).toISOString(), new Date("2024-01-01Z").toISOString())
    assert.equal(new Date(response.body.data.attributes.to).toISOString(), new Date("2025-01-01Z").toISOString())
    assert.equal(response.body.data.attributes.interval, "P1M")
  })

  it('volume all time by weeks', async () => {
    const response = await t.api.get('/TEST/stats/amount?interval=P1W', t.user1)
    // The number of weeks since 2024-01-01. This can fail in very specific cases, but should be good enough.
    const from = new Date(response.body.data.attributes.from)
    const weeks = Math.ceil((new Date().getTime() - from.getTime()) / (1000*60*60*24*7))
    assert.equal(response.body.data.attributes.values.length, weeks)
    assert.equal(response.body.data.attributes.values[0], 22900)
    assert.equal(response.body.data.attributes.values[1], 130400)
    assert.equal(response.body.data.attributes.values[weeks-1], 0)
    assert.equal(from.toISOString(), "2024-01-22T00:00:00.000Z")
    assert.ok(new Date().getTime() - new Date(response.body.data.attributes.to).getTime() < 1000, "To date should be now")
  })

  it('accounts single value with defined period', async () => {
    const response = await t.api.get('/TEST/stats/accounts?from=2024-01-01Z&to=2025-01-01Z', t.user1)
    assert.equal(response.body.data.attributes.values.length, 1)
    assert.equal(response.body.data.attributes.values[0], 80)
    assert.equal(new Date(response.body.data.attributes.from).toISOString(), new Date("2024-01-01Z").toISOString())
    assert.equal(new Date(response.body.data.attributes.to).toISOString(), new Date("2025-01-01Z").toISOString())
  })
  it('existing accounts now', async () => {
    const now = new Date().toISOString()
    const response = await t.api.get(`/TEST/stats/accounts?from=${now}`, t.user1)
    assert.equal(response.body.data.attributes.values[0], 73)
  })
  it('accounts with 20 transactions or more', async () => {
    const response = await t.api.get(`/TEST/stats/accounts?minTransactions=20`, t.user1)
    assert.equal(response.body.data.attributes.values[0], 58)
  })
  it('accounts without transactions in a defined month', async () => {
    const response = await t.api.get(`/TEST/stats/accounts?maxTransactions=0&from=2024-06-01&to=2024-07-01`, t.user1)
    assert.equal(response.body.data.attributes.values[0], 10)
  })
  it('monthly active accounts', async () => {
    const response = await t.api.get(`/TEST/stats/accounts?from=2024-01-01Z&to=2025-03-01Z&interval=P1M&minTransactions=1`, t.user1)
    assert.equal(response.body.data.attributes.values.length, 14)
    assert.equal(response.body.data.attributes.values[0], 3)
    assert.equal(response.body.data.attributes.values[5], 31)
    assert.equal(response.body.data.attributes.values[11], 75)
    assert.equal(response.body.data.attributes.values[12], 0)
  })
  it('monthly inactive accounts', async () => {
    const response = await t.api.get(`/TEST/stats/accounts?from=2024-01-01Z&to=2025-03-01Z&interval=P1M&maxTransactions=0`, t.user1)
    assert.equal(response.body.data.attributes.values.length, 14)
    assert.equal(response.body.data.attributes.values[0], 0)
    assert.equal(response.body.data.attributes.values[1], 7)
    assert.equal(response.body.data.attributes.values[10], 2)
    assert.equal(response.body.data.attributes.values[12], 70)


  })
  it('check monthly account activity coherence', async () => {
    const active = await t.api.get(`/TEST/stats/accounts?from=2024-01-01Z&to=2025-03-01Z&interval=P1M&minTransactions=1`, t.user1)
    const inactive = await t.api.get(`/TEST/stats/accounts?from=2024-01-01Z&to=2025-03-01Z&interval=P1M&maxTransactions=0`, t.user1)
    const all = await t.api.get(`/TEST/stats/accounts?from=2024-01-01Z&to=2025-03-01Z&interval=P1M`, t.user1)
    const activeValues = active.body.data.attributes.values
    const inactiveValues = inactive.body.data.attributes.values
    const allValues = all.body.data.attributes.values
    for (let i = 0; i < 12; i++) {
      assert.equal(activeValues[i] + inactiveValues[i], allValues[i])
    }
  })
})
