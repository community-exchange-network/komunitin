import { describe, it } from "node:test"
import assert from "node:assert"
import { setupServerTest } from "./setup"
import { Scope } from "src/server/auth"
import { fixUrl } from "src/utils/net"

/**
 * Not part of the CI/CD pipeline because it requires a local IntegralCES instance.
 */
describe.skip("Test migration from local IntegralCes instance", async () => {
  const t = setupServerTest(false)
  const icesURL = "http://localhost:2029"
  const migration = (code: string, accessToken: string) => ({
    data: {
      type: "migrations",
      attributes: {
        code,
        name: `IntegralCES ${code} migration`,
        kind: "integralces-accounting",
        data: {
          source: {
            url: icesURL,
            tokens: {
              accessToken,
              expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
            }
          }
        }
      }
    }
  })

  const getToken = async(baseUrl: string, username: string, password: string) => {
    const response = await fetch(`${fixUrl(baseUrl)}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username,
        password,
        client_id: 'komunitin-app',
        scope: 'openid email profile komunitin_social komunitin_accounting offline_access komunitin_social_read_all komunitin_superadmin'
      })
    })

    const token = await response.json() as any
    return token.access_token
  }

  await it ('migrate local integralces NET1', async () => {
    // Get token
    const accessToken = await getToken(icesURL, "admin", "replace-this-with-a-secure-password")
    const mig = migration("NET1", accessToken)
    const response = await t.api.post('/migrations', mig, {user: "12345", scopes: [Scope.Superadmin]})
    const id = response.body.data.id
    await t.api.post(`/migrations/${id}/play`, {user: "12345", scopes: [Scope.Superadmin]})
    // wait until migration is complete
    let completed
    do {
      const response = await t.api.get(`/migrations/${id}`, {user: "12345", scopes: [Scope.Superadmin]}, 200)
      completed = response.body.data
    } while (completed.attributes.status === 'started')
    assert.equal(completed.attributes.status, 'completed')

  })
  
})