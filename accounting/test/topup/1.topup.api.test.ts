import { describe, it, before } from "node:test"
import assert from "node:assert"

import { setupServerTest } from '../server/setup'
import { waitFor } from "../server/utils"
import { mockMollie } from "./mollie.mock"

describe('Topup API', async () => {
  const t = setupServerTest()
  
  before(() => {
    mockMollie(t.app)
  })
    
  const topupSettings = {
    enabled: true,
    defaultAllowTopup: true,
    depositCurrency: 'EUR',
    rate: { n: 100, d: 1 },  // 1=1
    minAmount: 1000, // 10 €
    maxAmount: 30000, // 300 €
    paymentProvider: 'mollie',
    mollieApiKey: 'test_key_from_settings'
  }

  it('topups are disabled by default', async () => {
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1, 403)
  })

  it('admin cannot enable topups', async () => {
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: topupSettings
      }
    }, t.admin, 403)
  })

  it('superadmin can enable topups', async () => {
    const response = await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: topupSettings
      }
    }, t.superadmin)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.attributes.enabled, true)
    assert.equal(response.body.data.attributes.mollieApiKey, undefined)
  })

  it('user can create a topup for their own account', async () => {
    const response = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)
    
    assert.equal(response.status, 201)
    assert.equal(response.body.data.type, 'topups')
    assert.equal(response.body.data.attributes.depositAmount, 1000)
    assert.equal(response.body.data.attributes.depositCurrency, 'EUR')
    assert.equal(response.body.data.attributes.receiveAmount, 100000)
    assert.equal(response.body.data.attributes.status, 'new')
    assert.equal(response.body.data.attributes.paymentProvider, 'mollie')
    assert.ok(response.body.data.id)
  })

  it('user cannot create topup for another user account', async () => {
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account2.id }
          }
        }
      }
    }, t.user1, 403)
  })

  it('topup validates minimum amount', async () => {
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 50, // Below minimum of 1000
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1, 403)
  })

  it('topup validates maximum amount', async () => {
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 35000, // Above maximum of 30000
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1, 403)
  })

  it('topup validates deposit currency', async () => {
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'USD' // Wrong currency
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1, 403)
  })

  it('topup applies rate conversion correctly', async () => {
    // Set rate to 15:11=1.3636...
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: {
          defaultAllowTopup: true,
          enabled: true,
          depositCurrency: 'EUR',
          rate: { n: 1500, d: 11 },
          minAmount: 1000,
          maxAmount: 30000,
          paymentProvider: 'mollie'
        }
      }
    }, t.admin)

    const response = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1200,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)
    
    assert.equal(response.status, 201)
    assert.equal(response.body.data.attributes.depositAmount, 1200)
    assert.equal(response.body.data.attributes.receiveAmount, 163636) // 1200 * 1500 / 11 = 163636.36 -> floored to 163636
  })

  it('user can retrieve their own topup', async () => {
    const createResponse = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 5000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)

    const topupId = createResponse.body.data.id

    const getResponse = await t.api.get(`/TEST/topups/${topupId}`, t.user1)
    assert.equal(getResponse.status, 200)
    assert.equal(getResponse.body.data.id, topupId)
    assert.equal(getResponse.body.data.attributes.depositAmount, 5000)
    assert.equal(getResponse.body.data.attributes.status, 'new')
  })

  it('user cannot retrieve another user topup', async () => {
    const createResponse = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 5000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)

    const topupId = createResponse.body.data.id

    await t.api.get(`/TEST/topups/${topupId}`, t.user2, 403)
  })

  it('topup respects account allowTopup setting', async () => {
    // Disable topup for account1
    await t.api.patch(`/TEST/accounts/${t.account1.id}/topup-settings`, {
      data: {
        attributes: {
          allowTopup: false
        }
      }
    }, t.admin)

    // Try to create topup
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1, 403)

    // Re-enable and try again
    await t.api.patch(`/TEST/accounts/${t.account1.id}/topup-settings`, {
      data: {
        attributes: {
          allowTopup: true
        }
      }
    }, t.admin)

    const response = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)

    assert.equal(response.status, 201)
  })

  it('topup respects currency defaultAllowTopup setting', async () => {
    // Reset account1 allowTopup to null (use default)
    await t.api.patch(`/TEST/accounts/${t.account1.id}/topup-settings`, {
      data: {
        attributes: {
          allowTopup: null
        }
      }
    }, t.admin)

    // Set defaultAllowTopup to false
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: {
          defaultAllowTopup: false
        }
      }
    }, t.admin)

    // Try to create topup - should fail
    await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1, 403)

    // Set defaultAllowTopup to true
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: {
          defaultAllowTopup: true
        }
      }
    }, t.admin)

    // Try again - should succeed
    const response = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 1000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)

    assert.equal(response.status, 201)
  })

  it('execute topup', async () => {
    const createResponse = await t.api.post('/TEST/topups', {
      data: {
        attributes: {
          depositAmount: 5000,
          depositCurrency: 'EUR'
        },
        relationships: {
          account: {
            data: { type: 'accounts', id: t.account1.id }
          }
        }
      }
    }, t.user1)

    const topupId = createResponse.body.data.id

    const triggerResponse = await t.api.patch(`/TEST/topups/${topupId}`, {
      data: {
        attributes: {
          status: 'pending'
        }
      }
    }, t.user1)
    assert.equal(triggerResponse.status, 200)
    const checkoutUrl = triggerResponse.body.data.attributes.paymentData.checkoutUrl
    assert.ok(checkoutUrl)

    // Simulate user completing payment by visiting checkout URL
    const res = await fetch(checkoutUrl) // this is a mocked URL handled by mollie mock
    assert.equal(res.status, 200)
    const resHtml = await res.text()
    assert.ok(resHtml.includes('Mock Mollie Checkout Page'))

    // Now check the new topup status
    let topupResponse = await t.api.get(`/TEST/topups/${topupId}`, t.user1)
    assert.equal(topupResponse.status, 200)
    assert.equal(topupResponse.body.data.attributes.paymentData.status, 'paid')
    // Wait for transfer to be processed
    await waitFor(async () => {
      topupResponse = await t.api.get(`/TEST/topups/${topupId}`, t.user1)
      return topupResponse.body.data.attributes.status === 'transfer_completed'
    })

    // Check transfer created
    const transferId = topupResponse.body.data.relationships.transfer.data.id
    const transferResponse = await t.api.get(`/TEST/transfers/${transferId}`, t.user1)
    assert.equal(transferResponse.status, 200)
    assert.equal(transferResponse.body.data.attributes.amount, Math.floor(500000*15/11))
    assert.equal(transferResponse.body.data.attributes.state, 'committed')
  })
})
