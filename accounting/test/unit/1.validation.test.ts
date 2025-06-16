import { checkExact, matchedData, ValidationChain, validationResult } from "express-validator"
import { describe, it } from "node:test"
import assert from "node:assert"
import { Validators } from "src/server/validation"
import { CreditCommonsValidators } from "src/creditcommons/validation"
import { validateInput } from "src/server/parse"

describe('Input validation', async () => {

  const testValidation = async (chain: ValidationChain[], input: any, output: any | false = input) => {
    const req = {
      query: {},
      body: input,
      params: {},
      param: (name: string) => undefined,
    }
    return new Promise((resolve) => {
      checkExact(chain)(req, {}, () => {
        let data
        let err
        try {
          data = validateInput(req as any)
          err = false
        } catch (e) {
          err = true
        }
        
        if (output === false && !err) {
          assert.fail("Expected validation error")
        } else if (output === false && err) {
          assert.ok(err)
        } else if (err) {
          assert.fail("Unexpected validation error")
        } else {
          assert.deepEqual(data, output)
        }
        resolve(void 0)
      })
    })
  }

  await it('account data', async () => {
    await testValidation(Validators.isCreateAccount(), {
      data: {}
    })
  })

  await it('update transfer', async () => {
    await testValidation(Validators.isUpdateTransfer(), {
      data: {
        attributes: {
          state: "committed"
        }
      }
    })
    
    await testValidation(Validators.isUpdateTransfer(), {
      data: {
        id: "error",
        attributes: {
          state: "committed"
        }
      }
    }, false)

    await testValidation(Validators.isUpdateTransfer(), {
      data: {
        attributes: {
          state: "committed",
          id: "error"
        }
      }
    }, false)

    const testTransfer = {
      data: {
        type: "transfers",
        attributes: {
          state: "committed",
          amount: 100,
          meta: "hello",
        },
        relationships: {
          payer: { data: {id: "3bc8e447-32cb-4dc7-b7ec-6a6f33c6c99e", type: "accounts"} },
          payee: { data: {id: "3bc8e447-32cb-4dc7-b7ec-6a6f33c6c99e", type: "accounts"} },
        }
      }
    } as any
    await testValidation(Validators.isCreateTransfer(), testTransfer)
    testTransfer.data.attributes.authorization = {
      type: "tag",
      value: "1234567890"
    }
    await testValidation(Validators.isCreateTransfer(), testTransfer)
  })
  await it('CreditCommons graft', async () => {
    await testValidation(CreditCommonsValidators.isGraft(), {
      data: {
        attributes: {
          peerNodePath: 'trunk',
          ourNodePath: 'trunk/branch2',
          lastHash: 'asdf',
          url: 'http://branch2.example.com',
          vostroId: '3bc8e447-32cb-4dc7-b7ec-6a6f33c6c99'
        },
        relationships: {
          vostro: {
            data: {
              id: '3bc8e447-32cb-4dc7-b7ec-6a6f33c6c99',
              type: 'accounts'
            }
          }
        }
      }
    })
  })
})