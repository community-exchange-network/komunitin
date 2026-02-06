import assert from 'node:assert'
import { describe, it } from 'node:test'
import supertest from 'supertest'
import { signJwt } from '../../mocks/auth'
import { _app } from '../../server'
import { createNotification, setupNotificationsTest } from './utils'

const uid = (c: string) => [8,4,4,4,12].map(len => c.repeat(len)).join('-')

describe('Notifications API', () => {
  const { appNotifications } = setupNotificationsTest()

  describe('GET /:code/notifications', () => {
    it('Returns notifications for authenticated user', async () => {
      const groupCode = 'GRP1'
      const userId = uid('1')
      const token = await signJwt(userId, ['komunitin_social'])

      await createNotification(groupCode, userId, 'evt-1', 'Test notification 1', 'Body 1')
      await createNotification(groupCode, userId, 'evt-2', 'Test notification 2', 'Body 2', new Date())

      const res = await supertest(_app)
        .get(`/${groupCode}/notifications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      assert.equal(res.body.data.length, 2)
      
      // Verify both notifications are present (order may vary)
      const titles = res.body.data.map((n: any) => n.attributes.title).sort()
      assert.deepEqual(titles, ['Test notification 1', 'Test notification 2'])
      
      // Verify meta.unread count (1 unread out of 2 total)
      assert.equal(res.body.meta.unread, 1)
    })

    it('Returns empty array for user with no notifications', async () => {
      const groupCode = 'GRP1'
      const userId = uid('2')
      const token = await signJwt(userId, ['komunitin_social'])

      const res = await supertest(_app)
        .get(`/${groupCode}/notifications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      assert.equal(res.body.data.length, 0)
      assert.equal(res.body.meta.unread, 0)
    })

    it('Only returns notifications for the correct tenant', async () => {
      const userId = uid('3')
      const token = await signJwt(userId, ['komunitin_social'])

      await createNotification('GRP1', userId, 'evt-grp1', 'GRP1 notification', 'Body GRP1')
      await createNotification('GRP2', userId, 'evt-grp2', 'GRP2 notification', 'Body GRP2')

      const res = await supertest(_app)
        .get(`/GRP1/notifications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      assert.equal(res.body.data.length, 1)
      assert.equal(res.body.data[0].attributes.title, 'GRP1 notification')
    })

    it('Rejects unauthorized requests', async () => {
      await supertest(_app)
        .get(`/GRP1/notifications`)
        .expect(400)
    })
  })

  describe('POST /:code/notifications/read', () => {
    it('Marks all unread notifications as read for authenticated user', async () => {
      const groupCode = 'GRP1'
      const userId = uid('4')
      const token = await signJwt(userId, ['komunitin_social'])

      await createNotification(groupCode, userId, 'evt-unread-1', 'Unread 1', 'Body 1')
      await createNotification(groupCode, userId, 'evt-unread-2', 'Unread 2', 'Body 2')
      await createNotification(groupCode, userId, 'evt-read-1', 'Already read', 'Body read', new Date('2024-01-01'))

      const res = await supertest(_app)
        .post(`/${groupCode}/notifications/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Should report 2 notifications updated
      assert.equal(res.body.meta.updated, 2)

      // Verify all unread notifications are now marked as read
      const allNotifications = appNotifications.filter((n: any) => n.userId === userId)
      assert.equal(allNotifications.length, 3)
      
      const nowRead = allNotifications.filter((n: any) => n.readAt !== null && n.readAt !== undefined)
      assert.equal(nowRead.length, 3, 'All 3 notifications should have readAt set')
    })

    it('Only marks notifications as read for the correct tenant', async () => {
      const userId = uid('5')
      const token = await signJwt(userId, ['komunitin_social'])

      await createNotification('GRP1', userId, 'evt-grp1-1', 'GRP1 notification', 'Body GRP1')
      await createNotification('GRP2', userId, 'evt-grp2-1', 'GRP2 notification', 'Body GRP2')

      const res = await supertest(_app)
        .post(`/GRP1/notifications/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      // Should only mark GRP1 notification as read
      assert.equal(res.body.meta.updated, 1)

      // Verify GRP1 notification is read but GRP2 is not
      const grp1Notification = appNotifications.find((n: any) => n.tenantId === 'GRP1' && n.userId === userId)
      const grp2Notification = appNotifications.find((n: any) => n.tenantId === 'GRP2' && n.userId === userId)
      
      assert.ok(grp1Notification.readAt instanceof Date, 'GRP1 notification should be marked as read')
      assert.strictEqual(grp2Notification.readAt, undefined, 'GRP2 notification should remain unread')
    })

    it('Only marks notifications as read for the authenticated user', async () => {
      const userA = uid('6')
      const userB = uid('7')
      const tokenA = await signJwt(userA, ['komunitin_social'])

      await createNotification('GRP1', userA, 'evt-user-a', 'User A notification', 'Body A')
      await createNotification('GRP1', userB, 'evt-user-b', 'User B notification', 'Body B')

      const res = await supertest(_app)
        .post(`/GRP1/notifications/read`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200)

      // Should only mark userA's notification as read
      assert.equal(res.body.meta.updated, 1)

      // Verify userA's notification is read but userB's is not
      const userANotification = appNotifications.find((n: any) => n.userId === userA)
      const userBNotification = appNotifications.find((n: any) => n.userId === userB)
      
      assert.ok(userANotification.readAt instanceof Date, 'User A notification should be marked as read')
      assert.strictEqual(userBNotification.readAt, undefined, 'User B notification should remain unread')
    })

    it('Returns 0 count when user has no unread notifications', async () => {
      const groupCode = 'GRP1'
      const userId = uid('8')
      const token = await signJwt(userId, ['komunitin_social'])

      await createNotification(groupCode, userId, 'evt-already-read', 'Already read', 'Body', new Date())

      const res = await supertest(_app)
        .post(`/${groupCode}/notifications/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      assert.equal(res.body.meta.updated, 0)
    })

    it('Returns 0 count when user has no notifications at all', async () => {
      const groupCode = 'GRP1'
      const userId = uid('9')
      const token = await signJwt(userId, ['komunitin_social'])

      const res = await supertest(_app)
        .post(`/${groupCode}/notifications/read`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      assert.equal(res.body.meta.updated, 0)
    })

    it('Rejects unauthorized requests', async () => {
      await supertest(_app)
        .post(`/GRP1/notifications/read`)
        .expect(400)
    })
  })
})
