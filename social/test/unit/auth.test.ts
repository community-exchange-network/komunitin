import assert from 'node:assert/strict'
import test from 'node:test'
import { exchangeAccountingToken } from '../../src/clients/auth'
import { Scope } from '../../src/server/scopes'

const response = (body: Record<string, unknown>): Response => {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}

const tokenResponse = (
  token: string,
  scope: string,
  expiresIn = 3600,
): Response => {
  return response({
    access_token: token,
    expires_in: expiresIn,
    scope,
    token_type: 'Bearer',
  })
}

const getRequestParam = (init: RequestInit | undefined, name: string): string => {
  assert.ok(init?.body instanceof URLSearchParams)
  const value = init.body.get(name)
  assert.ok(value)
  return value
}

test('isolates cached tokens by subject token and scope', async (t) => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    requests++
    const subjectToken = getRequestParam(init, 'subject_token')
    const scope = getRequestParam(init, 'scope')
    return tokenResponse(`${subjectToken}-${scope}`, scope)
  })

  const subjectRead = await exchangeAccountingToken('isolated-subject-a', Scope.AccountingRead)
  const subjectWrite = await exchangeAccountingToken('isolated-subject-a', Scope.AccountingWrite)
  const otherSubjectRead = await exchangeAccountingToken('isolated-subject-b', Scope.AccountingRead)

  assert.strictEqual(subjectRead, 'isolated-subject-a-accounting:read')
  assert.strictEqual(subjectWrite, 'isolated-subject-a-accounting:write')
  assert.strictEqual(otherSubjectRead, 'isolated-subject-b-accounting:read')
  assert.strictEqual(
    await exchangeAccountingToken('isolated-subject-a', Scope.AccountingRead),
    subjectRead,
  )
  assert.strictEqual(
    await exchangeAccountingToken('isolated-subject-a', Scope.AccountingWrite),
    subjectWrite,
  )
  assert.strictEqual(
    await exchangeAccountingToken('isolated-subject-b', Scope.AccountingRead),
    otherSubjectRead,
  )
  assert.strictEqual(requests, 3)
})

test('shares an in-flight exchange for concurrent calls', async (t) => {
  let requests = 0
  let resolveExchange!: (response: Response) => void
  const exchangeResponse = new Promise<Response>((resolve) => {
    resolveExchange = resolve
  })

  t.mock.method(globalThis, 'fetch', () => {
    requests++
    return exchangeResponse
  })

  const first = exchangeAccountingToken('concurrent-subject', Scope.AccountingRead)
  const second = exchangeAccountingToken('concurrent-subject', Scope.AccountingRead)

  assert.strictEqual(requests, 1)
  resolveExchange(tokenResponse('concurrent-token', Scope.AccountingRead))
  assert.deepStrictEqual(await Promise.all([first, second]), [
    'concurrent-token',
    'concurrent-token',
  ])
})

test('refreshes tokens at the expiry safety margin', async (t) => {
  let now = 1_000_000
  let requests = 0
  t.mock.method(Date, 'now', () => now)
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    requests++
    return tokenResponse(`expiring-${requests}`, getRequestParam(init, 'scope'))
  })

  assert.strictEqual(
    await exchangeAccountingToken('expiring-subject', Scope.AccountingRead),
    'expiring-1',
  )

  now += 3_540_000 - 1
  assert.strictEqual(
    await exchangeAccountingToken('expiring-subject', Scope.AccountingRead),
    'expiring-1',
  )

  now++
  assert.strictEqual(
    await exchangeAccountingToken('expiring-subject', Scope.AccountingRead),
    'expiring-2',
  )
  assert.strictEqual(requests, 2)
})

test('rejects invalid expiry metadata and mismatched scopes without caching', async (t) => {
  const subjectRequests = new Map<string, number>()
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const subjectToken = getRequestParam(init, 'subject_token')
    const scope = getRequestParam(init, 'scope')
    const requests = (subjectRequests.get(subjectToken) ?? 0) + 1
    subjectRequests.set(subjectToken, requests)

    if (requests > 1) {
      return tokenResponse(`${subjectToken}-valid`, scope)
    }
    return subjectToken === 'invalid-expiry-subject'
      ? tokenResponse('invalid-expiry', scope, 0)
      : tokenResponse('mismatched-scope', Scope.AccountingWrite)
  })

  await assert.rejects(
    exchangeAccountingToken('invalid-expiry-subject', Scope.AccountingRead),
    /Auth token exchange failed/,
  )
  assert.strictEqual(
    await exchangeAccountingToken('invalid-expiry-subject', Scope.AccountingRead),
    'invalid-expiry-subject-valid',
  )

  await assert.rejects(
    exchangeAccountingToken('mismatched-scope-subject', Scope.AccountingRead),
    /Auth token exchange failed/,
  )
  assert.strictEqual(
    await exchangeAccountingToken('mismatched-scope-subject', Scope.AccountingRead),
    'mismatched-scope-subject-valid',
  )
  assert.deepStrictEqual([...subjectRequests.values()], [2, 2])
})
