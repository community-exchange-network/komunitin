import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createMember, getUserIdForMember } from '../../mocks/db'
import '../../mocks/web-push'
import { createEvent, setupNotificationsTest, verifyNotification } from './utils'

const { put, appNotifications } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
  useSyntheticQueue: true,
})

describe('MemberJoined notifications', () => {
  it('should process MemberJoined event and generate a welcome notification', async () => {
    const groupId = 'GRP1'
    const member = createMember({ groupCode: groupId, name: 'Ada Lovelace' })
    const userId = getUserIdForMember(member.id)

    const eventData = createEvent('MemberJoined', member.id, groupId, userId, 'test-member-joined-1', 'member')

    await put(eventData)

    assert.equal(appNotifications.length, 1, 'Should create 1 notification')
    const notification = appNotifications[0]
    assert.equal(notification.tenantId, groupId)
    assert.equal(notification.userId, userId)

    await verifyNotification(userId, groupId, notification.id, {
      title: 'Welcome to Group GRP1!',
      body: 'Hi Ada Lovelace, your account is now active! Start exploring offers and needs in your community. Happy exchange!',
    })
  })
})
