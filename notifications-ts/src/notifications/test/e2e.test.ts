import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { mockDate, restoreDate } from '../../mocks/date'
import { resetWebPushMocks, sendNotification } from '../../mocks/web-push'
import { createMember, getUserIdForMember } from '../../mocks/db'
import prisma from '../../utils/prisma'
import { createEventBody, setupNotificationsTest, subscribeToPushNotifications } from './utils'

const credentials = Buffer.from('testuser:testpass').toString('base64')

const { app, appNotifications, pushQueue, email } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
})

describe('End-to-end: HTTP event to all channels', () => {
  beforeEach(() => {
    // Fix time to noon UTC so push notifications are never delayed (quiet hours are 22–08).
    mockDate('2026-03-01T12:00:00.000Z')
    resetWebPushMocks()
    email.reset()
  })

  afterEach(() => {
    restoreDate()
  })

  it('MemberJoined event via HTTP triggers in-app, push, and email', async () => {
    const groupId = 'GRP1'
    // Use fixed coordinates (UTC+0) so pushNotificationDelay returns 0 at noon UTC.
    const member = createMember({ groupCode: groupId, name: 'Ada Lovelace', attributes: {
      location: { type: 'Point', coordinates: [0, 0] },
    }})
    const userId = getUserIdForMember(member.id)

    // Subscribe the user so the push channel fires
    await subscribeToPushNotifications(groupId, userId)

    // POST the event via HTTP
    const body = createEventBody('MemberJoined', { code: groupId, user: userId, data: { member: member.id } })
    const res = await app
      .post('/events')
      .set('Content-Type', 'application/vnd.api+json')
      .set('Authorization', `Basic ${credentials}`)
      .send(body)
      .expect(201)

    assert.strictEqual(res.body.data.type, 'events')

    // 1) In-app notification
    assert.strictEqual(appNotifications.length, 1, 'Should create 1 in-app notification')
    const notification = appNotifications[0]
    assert.strictEqual(notification.tenantId, groupId)
    assert.strictEqual(notification.userId, userId)
    assert.strictEqual(notification.title, 'Welcome to Group GRP1!')
    assert.ok(notification.body.includes('Ada Lovelace'))

    // 2) Push notification (auto-dispatched since mockDate avoids quiet hours)
    assert.strictEqual(pushQueue.add.mock.callCount(), 1, 'Should schedule 1 push notification')
    assert.strictEqual(sendNotification.mock.callCount(), 1, 'Should send 1 web push')
    const pushNotifications = await prisma.pushNotification.findMany()
    assert.strictEqual(pushNotifications.length, 1)
    assert.strictEqual(pushNotifications[0].userId, userId)

    // 3) Email
    assert.strictEqual(email.sentEmails.length, 1, 'Should send 1 welcome email')
    const msg = email.lastEmail()
    assert.ok(msg.html.length > 0, 'Email should have HTML content')
  })
})
