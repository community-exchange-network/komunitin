import assert from 'node:assert'
import supertest from 'supertest'
import { _app } from '../../server'
import { signJwt } from '../../mocks/auth'

export const createEvent = (name: string, payloadId: string, groupId: string, userId: string, eventId: string, dataKey: string = 'transfer') => {
  return {
    name,
    time: new Date().toISOString(),
    data: JSON.stringify({ [dataKey]: payloadId }),
    source: 'mock-accounting',
    code: groupId,
    user: userId,
    id: eventId
  }
}

export const verifyNotification = async (
  userId: string,
  groupId: string,
  notificationId: string,
  expected: string | { title: string; body?: string }
) => {
  const expectedTitle = typeof expected === 'string' ? expected : expected.title;
  const expectedBody = typeof expected === 'string' ? undefined : expected.body;

  const token = await signJwt(userId, ['komunitin_social'])
  const response = await supertest(_app)
    .get(`/${groupId}/notifications`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)

  assert.equal(response.body.data.length, 1)
  assert.equal(response.body.data[0].id, notificationId)
  assert.equal(response.body.data[0].attributes.title, expectedTitle)

  if (expectedBody !== undefined) {
    assert.equal(response.body.data[0].attributes.body, expectedBody)
  }
}
