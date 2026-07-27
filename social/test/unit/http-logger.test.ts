import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeRequest } from '../../src/server/http-logger'

test('redacts action tokens from every logged request field', () => {
  const token = 'valid-unsubscribe-token'
  const req = {
    url: `/users/unsubscribe?token=${token}`,
    query: { token },
  }
  Object.defineProperty(req, 'raw', {
    value: {
      headers: {
        host: 'localhost:2028',
        referer: `https://app.komunitin.org/users/unsubscribe?token=${token}`,
      }
    }
  })

  const logged = serializeRequest(req)

  assert.ok(!JSON.stringify(logged).includes(token))
  assert.strictEqual(logged.query.token, '[REDACTED]')
  assert.strictEqual(
    logged.headers.referer,
    'https://app.komunitin.org/users/unsubscribe?token=%5BREDACTED%5D'
  )
})
