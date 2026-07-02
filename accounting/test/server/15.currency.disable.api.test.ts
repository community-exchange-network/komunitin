import { describe, it } from "node:test"
import assert from "node:assert"
import { PrismaClient } from "@prisma/client"

import { tenantDb } from "../../src/controller/multitenant"
import { userAuth } from "./api.data"
import { setupServerTest } from './setup'

const readCurrencyStateFromDB = async (code: string) => {
  const prisma = new PrismaClient()
  const db = tenantDb(prisma, code)

  try {
    const currency = await db.currency.findUniqueOrThrow({
      where: { code },
    })
    const accounts = await db.account.findMany({
      where: {
        kind: "user",
      },
      orderBy: {
        code: "asc",
      },
    })

    return { currency, accounts }
  } finally {
    await prisma.$disconnect()
  }
}

describe('Currency disable', async () => {
  const t = setupServerTest()

  it('should return currency status', async () => {
    const response = await t.api.get(`/TEST/currency`, t.user1)
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('non-admin cannot disable currency', async () => {
    await t.api.patch(
      `/TEST/currency`, 
      { data: { attributes: { status: 'disabled' } } },
      t.user1,
      403
    )
  })

  it('admin can disable own currency', async () => {
    const response = await t.api.patch(
      `/TEST/currency`, 
      { data: { attributes: { status: 'disabled' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'disabled')
  })

  it('currency doesn\'t appear in currency list', async () => {
    const response = await t.api.get(`/currencies`)
    const codes = response.body.data.map((c: any) => c.attributes.code)
    assert.ok(!codes.includes('TEST'))
  })

  it('cannot operate with disabled currency', async () => {
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment in disabled currency", "committed", t.user1, 403)
    await t.api.patch('/TEST/currency/settings', {data: {
      attributes: {
        defaultInitialCreditLimit: 1234
      }
    }}, t.admin, 403)
    await t.createAccount("noway", t.currency.code, undefined, 403)
  })

  it('accounts are disabled in disabled currency', async () => {
    const response = await t.api.get(`/TEST/accounts`, t.user1)
    for (const account of response.body.data) {
      assert.equal(account.attributes.status, 'disabled')
    }
  })

  it('and cannot be re-enabled', async () => {
    const response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`, 
      { data: { attributes: { status: 'active' } } },
      t.admin,
      403
    )
    assert.equal(response.body.errors[0].code, 'InactiveCurrency')
  })

  it('but can still get currency info', async () => {
    const response = await t.api.get(`/TEST/currency`, t.user1)
    assert.equal(response.body.data.attributes.code, 'TEST')
  })

  it('disabled currency can be re-enabled by admin', async () => {
    const response = await t.api.patch(
      `/TEST/currency`,
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('currency appear again in currency list', async () => {
    const response = await t.api.get(`/currencies`)
    const codes = response.body.data.map((c: any) => c.attributes.code)
    assert.ok(codes.includes('TEST'))
  })
  it('accounts can be re-enabled after currency is re-enabled', async () => {
    const response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`, 
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'active')
    await t.api.patch(
      `/TEST/accounts/${t.account2.id}`, 
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
  })
  
  it('can operate again with re-enabled currency', async () => {
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment in re-enabled currency", "committed", t.user1)
  })

  it('requires authentication to delete currency', async () => {
    await t.api.delete('/TEST/currency', undefined, 401)
  })

  it('non-admin cannot delete currency', async () => {
    await t.api.delete('/TEST/currency', t.user1, 403)
  })

  it('does not allow deleting through status update', async () => {
    await t.api.patch(
      '/TEST/currency',
      { data: { attributes: { status: 'deleted' } } },
      t.admin,
      400,
    )
  })

  it('disabled currency can be deleted', async () => {
    const admin = userAuth("delete-disabled")

    await t.createCurrency({ code: "DEL2" }, admin)
    await t.api.patch(
      '/DEL2/currency',
      { data: { attributes: { status: 'disabled' } } },
      admin,
    )
    await t.api.delete('/DEL2/currency', admin)

    await t.api.get('/DEL2/currency', undefined, 404)

    const { currency } = await readCurrencyStateFromDB('DEL2')
    assert.equal(currency.status, 'deleted')
  })

  it('admin can delete active currency', async () => {
    await t.api.delete('/TEST/currency', t.admin)

    const { currency, accounts } = await readCurrencyStateFromDB('TEST')
    assert.equal(currency.status, 'deleted')
    accounts.forEach(account => assert.equal(account.status, 'disabled'))
  })

  it('deleted currency is hidden from the API', async () => {
    await t.api.get('/TEST/currency', undefined, 404)

    const response = await t.api.get('/currencies')
    const codes = response.body.data.map((c: any) => c.attributes.code)
    assert.ok(!codes.includes('TEST'))
  })

  it('deleted currency cannot be operated or re-enabled', async () => {
    await t.createAccount("noway", t.currency.code, t.admin, 404)
    await t.api.patch(
      '/TEST/currency',
      { data: { attributes: { status: 'active' } } },
      t.admin,
      404,
    )
    await t.api.delete('/TEST/currency', t.admin, 404)
  })

})
