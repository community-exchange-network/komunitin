import assert from "node:assert"
import { before, describe, it } from "node:test"
import { config } from "src/config"
import { Scope } from "src/server/auth"
import { validate as isUuid } from "uuid"
import { testCurrency } from "./api.data"
import { setupServerTest } from "./setup"

describe('Accounts endpoints', async () => {
  const t = setupServerTest(false)

  const admin = { user: "1", scopes: [Scope.Accounting] }
  const user2 = { user: "2", scopes: [Scope.Accounting] }
  const user3 = { user: "3", scopes: [Scope.Accounting] }

  before(async () => {
    // Create currency TEST
    await t.api.post('/currencies', testCurrency(), admin)
  })

  await it('admin creates own account', async () => {
    const response = await t.api.post('/TEST/accounts', {
      data: {}
    } , admin)
    assert(isUuid(response.body.data.id), "The account id is not a valid UUID")
    assert.equal(response.body.data.type, 'accounts')
    assert.equal(response.body.data.attributes.code, 'TEST0000')
    assert.equal(response.body.data.attributes.balance, 0)
    assert.equal(response.body.data.attributes.creditLimit, 1000)
    assert.equal(response.body.data.attributes.maximumBalance, undefined)
  })

  await it('admin creates user account', async () => {
    const response = await t.api.post('/TEST/accounts', {
      data: {
        relationships: { users: { data: [{ type: "users", id: "2" }] }}
      },
      included: [{ type: "users", id: "2"}]
    }, admin)
    assert(isUuid(response.body.data.id), "The account id is not a valid UUID")
    assert.equal(response.body.data.type, 'accounts')
    assert.equal(response.body.data.attributes.code, 'TEST0001')
  })

  await it('admin creates account with attributes', async () => {
    const response = await t.api.post('/TEST/accounts', {
      data: {
        attributes: { 
          code: 'TEST2000', 
          creditLimit: 2000,
          maximumBalance: 20000
        }
      }
    }, admin)

    assert(isUuid(response.body.data.id), "The account id is not a valid UUID")
    assert.equal(response.body.data.type, 'accounts')
    assert.equal(response.body.data.attributes.code, 'TEST2000')
    assert.equal(response.body.data.attributes.creditLimit, 2000)
    assert.equal(response.body.data.attributes.maximumBalance, 20000)
  })

  it('unauthorized creation', async () => {
    await t.api.post('/TEST/accounts', { 
      data: { 
        relationships: {users: { data: [{ type: "users", id: "3" }] }} 
      },
      included: [{type: "users",id: "3"}]
     }, undefined, 401)
  })

  it('forbidden creation', async () => {
    await t.api.post('/TEST/accounts', { data: {} }, user3, 403)
  })

  let account0: any;
  let account1: any;
  it('user lists accounts', async () => {
    const response = await t.api.get('/TEST/accounts', user2)
    assert.equal(response.body.data.length, 3)
    account0 = response.body.data[0]
    account1 = response.body.data[1]
    assert.equal(account0.attributes.code, 'TEST0000')
    assert.equal(account1.attributes.code, 'TEST0001')
  })

  it('unauthorized list accounts', async() => {
    await t.api.get('/TEST/accounts', undefined, 401)
  })
  it('forbidden list accounts', async() => {
    await t.api.get('/TEST/accounts', user3, 403)
  })

  it('allowed anonymous list accounts by id', async () => {
    const response = await t.api.get('/TEST/accounts?filter[id]=' + account0.id, undefined)
    assert.equal(response.body.data.length, 1)
    assert.equal(response.body.data[0].links.self, `${config.API_BASE_URL}/TEST/accounts/${account0.id}`)
  })

  await it('user get account', async () => {
    const response1 = await t.api.get('/TEST/accounts?filter[code]=TEST0000', user2)
    assert.equal(response1.body.data.length, 1)
    assert.equal(response1.body.data[0].attributes.code, 'TEST0000')
    const response2 = await t.api.get(`/TEST/accounts/${account0.id}`, user2)
    assert.equal(response2.body.data.attributes.code, 'TEST0000')
  })

  it('including currency', async () => {
    const response = await t.api.get(`/TEST/accounts/${account0.id}?include=currency`, user2)
    assert.equal(response.body.data.attributes.code, 'TEST0000')
    assert.equal(response.body.included[0].type, 'currencies')
    assert.equal(response.body.included[0].attributes.code, 'TEST')
    assert.equal(response.body.included[0].attributes.symbol, 'T$')
    assert.equal(response.body.data.links.self, `${config.API_BASE_URL}/TEST/accounts/${account0.id}`)
  })

  it('including settings', async() => {
    const response = await t.api.get(`/TEST/accounts/${account0.id}?include=settings`, user2)
    assert.equal(response.body.data.attributes.code, 'TEST0000')
    assert.equal(response.body.included[0].type, 'account-settings')
    assert.equal(response.body.included[0].attributes.acceptPaymentsAutomatically, false)
  })
  
  it('including settings, currency and currency settings', async () => {
    const response = await t.api.get(`/TEST/accounts/${account0.id}?include=settings,currency,currency.settings`, user2)
    assert.equal(response.body.data.attributes.code, 'TEST0000')
    assert.equal(response.body.included[1].type, 'account-settings')
    assert.equal(response.body.included[0].type, 'currencies')
    assert.equal(response.body.included[2].type, 'currency-settings')
  })
  
  // Account endpoints are public.
  it('unauthorized get account', async() => {
    await t.api.get(`/TEST/accounts/${account0.id}`, undefined, 200)
  })
  it('external user get account', async() => {
    await t.api.get(`/TEST/accounts/${account0.id}`, user3, 200)
  })

  it('admin updates credit limit', async () => {
    const response = await t.api.patch(`/TEST/accounts/${account0.id}`, {
      data: {
        attributes: { creditLimit: 2000 }
      }
    }, admin)
    assert.equal(response.body.data.attributes.code, 'TEST0000')
    assert.equal(response.body.data.attributes.creditLimit, 2000)
  })

  it('admin updates with large credit limit', async () => {
    const response = await t.api.patch(`/TEST/accounts/${account0.id}`, {
      data: {
        attributes: { creditLimit: 10000000000 }
      }
    }, admin)
    assert.equal(response.body.data.attributes.code, 'TEST0000')
    assert.equal(response.body.data.attributes.creditLimit, 10000000000)
  })

  it('admin updates code', async () => {
    const response = await t.api.patch(`/TEST/accounts/${account0.id}`, {
      data: {
        attributes: { code: 'TEST1000'}
      }
    }, admin)
    assert.equal(response.body.data.attributes.code, 'TEST1000')
  })
  it ('illegal code', async () => {
    await t.api.patch(`/TEST/accounts/${account0.id}`, {
      data: { attributes: { code: 'ILLE0003'} }
    }, admin, 400)
  })
  it ('repeated code', async () => {
    await t.api.patch(`/TEST/accounts/${account0.id}`, {
      data: { attributes: { code: 'TEST0001'} }
    }, admin, 400)
  })
  it('admin updates maximum balance', async () => {
    const response = await t.api.patch(`/TEST/accounts/${account1.id}`, {
      data: { attributes: { maximumBalance: 100000 } }
    }, admin)
    assert.equal(response.body.data.attributes.maximumBalance, 100000)
  })
  it('user cannot update maximum balance', async() => {
    await t.api.patch(`/TEST/accounts/${account1.id}`, {
      data: {attributes: { maximumBalance: 200000 }}
    }, user2, 403)
  })
    
  it('admin cannot update balance', async () => {
    await t.api.patch(`/TEST/accounts/${account0.id}`, {
      data: {attributes: { balance: 100 }}
    }, admin, 400)
  })
  it('user cannot update own limits', async() => {
    await t.api.patch(`/TEST/accounts/${account1.id}`, {
      data: {attributes: { creditLimit: 100000 }}
    }, user2, 403)
  })

  it('admin can download CSV', async() => {
    const response = await t.api.get(`/TEST/accounts.csv`, admin, 200, 'text/csv')
    assert.equal(response.headers['content-disposition'], 'attachment; filename="accounts.csv"')
    const lines = response.text.split('\n').filter(line => line.trim().length > 0).map(line => line.split(','))
    assert.deepEqual(lines[0], ['id', 'created', 'updated', 'code', 'status', 'balance', 'creditLimit', 'maximumBalance', 'key', 'user.id'])
    assert.equal(lines.length, 4) // header + 3 accounts
    assert.equal(lines[1][3], 'TEST0001')
    assert.equal(lines[2][3], 'TEST1000')
    assert.equal(lines[3][3], 'TEST2000')
  })
  
  it('user cannot delete other accounts', async () => {
    await t.api.delete(`/TEST/accounts/${account0.id}`, user2, 403)
  })
  
  it('user can delete own account', async () => {
    await t.api.delete(`/TEST/accounts/${account1.id}`, user2)
  })

  let account3: any;
  const usersBody = (userIds: string[]) => ({data: {
    relationships: { users: { data: userIds.map(id => ({type: "users", id})) }}
  }})

  
  it('user cannot change account users', async() => {
    // Create account first:
    account3 = await t.createAccount(user2.user, "TEST", admin)
    await t.api.patch(`/TEST/accounts/${account3.id}`, usersBody([user3.user]), user2, 403)
  })
  
  it('admin can change user from account', async() => {
    const response = await t.api.patch(`/TEST/accounts/${account3.id}`, usersBody([user3.user]), admin)
    account3 = response.body.data
    assert.equal(account3.relationships.users.data.length, 1)
    assert.equal(account3.relationships.users.data[0].id, user3.user)
  })

  it('admin can add users to account', async() => {
    const response = await t.api.patch(`/TEST/accounts/${account3.id}`, usersBody([user2.user, user3.user]), admin)
    account3 = response.body.data
    const users = account3.relationships.users.data.map((u: {id: string}) => u.id).sort()
    assert.deepEqual(users, ['2', '3'])
  })

  it('change credit limit beyond maximum balance', async () => {
    // Create account with credit limit 5000 and maximum balance 5000
    let response = await t.api.post('/TEST/accounts', {
      data: {
        attributes: {
          creditLimit: 5000,
          maximumBalance: 5000
        }
      }
    }, admin)
    const account = response.body.data
    assert.equal(account.attributes.creditLimit, 5000)
    assert.equal(account.attributes.maximumBalance, 5000)

    // Update credit limit to 20000
    response = await t.api.patch(`/TEST/accounts/${account.id}`, {
      data: {
        attributes: {
          creditLimit: 20000
        }
      }
    }, admin)
    const updatedAccount = response.body.data
    assert.equal(updatedAccount.attributes.creditLimit, 20000)
    assert.equal(updatedAccount.attributes.maximumBalance, 5000)

  })

})