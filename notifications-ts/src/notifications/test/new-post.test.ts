import assert from 'node:assert'
import { beforeEach, describe, it } from 'node:test'
import { createMember, createMembers, createPost, db, getUserIdForMember } from '../../mocks/db'
import { resetWebPushMocks } from '../../mocks/web-push'
import { createEvent, setupNotificationsTest, subscribeToPushNotifications } from './utils'

const { put, appNotifications, pushQueue } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
  useSyntheticQueue: true,
})

beforeEach(() => {
  resetWebPushMocks()
})

describe('New post notifications (URGENT)', () => {
  it('should process urgent OfferPublished event and notify all group users', async () => {
    const groupCode = 'GRP1'
    createMembers(groupCode) // creates 5 members/users
    const members = db.members.filter(m => m.relationships.group.data.id === `group-${groupCode}`)
    const authorMember = members[0]
    const authorUserId = getUserIdForMember(authorMember.id)

    const created = new Date()
    const expires = new Date()
    expires.setDate(created.getDate() + 5) // 5 days window <= 7 days

    const offer = createPost('offers', {
      id: 'offer-urgent',
      code: 'OFF1',
      groupCode,
      memberId: authorMember.id,
      attributes: {
        title: 'Urgent Offer',
        description: 'Urgent content',
        created: created.toISOString(),
        expires: expires.toISOString(),
      }
    })

    const eventData = createEvent('OfferPublished', { code: groupCode, user: authorUserId, data: { offer: offer.id } })

    await put(eventData)

    // Wait a bit for async processing (the delay in handler might make it race-y with the check if we don't wait)
    // The worker handles it. In other tests they don't seem to wait much but since I added 50ms delay * 5 members = 250ms+
    await new Promise(resolve => setTimeout(resolve, 1000))

    assert.equal(appNotifications.length, 5, "Should notify every group user")

    assert.equal(
      appNotifications.some(n => n.userId === authorUserId),
      true,
      "Author should receive their own urgent post notification",
    )
    const notification = appNotifications[0]

    const expectedTitle = `New Offer from ${authorMember.attributes.name}`
    assert.equal(notification.title, expectedTitle)
    assert.equal(notification.body, 'Urgent Offer')
  })

  it('should NOT process non-urgent OfferPublished event', async () => {
    const groupCode = 'GRP1'
    createMembers(groupCode)
    const authorMember = db.members[0]
    const authorUserId = getUserIdForMember(authorMember.id)

    const created = new Date()
    const expires = new Date()
    expires.setDate(created.getDate() + 10) // 10 days window > 7 days

    const offer = createPost('offers', {
      id: 'offer-non-urgent',
      code: 'OFF2',
      groupCode,
      memberId: authorMember.id,
      attributes: {
        title: 'Lazy Offer',
        description: 'I will do this next month',
        created: created.toISOString(),
        expires: expires.toISOString(),
      }
    })

    const eventData = createEvent('OfferPublished', { code: groupCode, user: authorUserId, data: { offer: offer.id } })

    await put(eventData)
    await new Promise(resolve => setTimeout(resolve, 500))

    const notification = appNotifications.find(n => n.userId === authorUserId)
    assert.ok(notification, "Author should receive confirmation notification")
    assert.equal(appNotifications.length, 1, "Only author should receive notification")
  })

  it('should process urgent NeedPublished event', async () => {
    const groupCode = 'GRP1'
    createMembers(groupCode)
    const authorMember = db.members[0]
    const authorUserId = getUserIdForMember(authorMember.id)

    const created = new Date()
    const expires = new Date()
    expires.setDate(created.getDate() + 3) // 3 days window <= 7 days

    const need = createPost('needs', {
      id: 'need-urgent',
      code: 'NEE1',
      groupCode,
      memberId: authorMember.id,
      attributes: {
        description: 'I need some help urgently!',
        created: created.toISOString(),
        expires: expires.toISOString(),
      }
    })

    const eventData = createEvent('NeedPublished', { code: groupCode, user: authorUserId, data: { need: need.id } })

    await put(eventData)
    await new Promise(resolve => setTimeout(resolve, 1000))

    assert.equal(appNotifications.length, 5)
    assert.equal(appNotifications.some(n => n.userId === authorUserId), true)
    const notification = appNotifications[0]
    assert.equal(notification.title, `New Want from ${authorMember.attributes.name}`)
    assert.equal(notification.body, 'I need some help urgently!')
  })

  it('deduplicates community recipients and uses fresh member preferences', async () => {
    const groupCode = 'GRP1'
    const members = createMembers(groupCode)
    const authorMember = members[0]
    const authorUserId = getUserIdForMember(authorMember.id)
    const sharedUserId = getUserIdForMember(members[1].id)
    const linkedMember = createMember({
      groupCode,
      id: 'member-GRP1-linked',
      userId: sharedUserId,
    })
    const sharedRelations = db.memberUsers.filter(
      relation => relation.relationships.user.data.id === sharedUserId,
    )
    sharedRelations[0].attributes.notifications.group = false
    sharedRelations[1].attributes.notifications.group = true
    await subscribeToPushNotifications(groupCode, sharedUserId)

    const publishUrgentOffer = async (suffix: string) => {
      const created = new Date()
      const expires = new Date(created)
      expires.setDate(created.getDate() + 2)
      const offer = createPost('offers', {
        id: `offer-${suffix}`,
        code: `OFF-${suffix}`,
        groupCode,
        memberId: authorMember.id,
        attributes: {
          title: `Urgent offer ${suffix}`,
          created: created.toISOString(),
          expires: expires.toISOString(),
        },
      })
      await put(createEvent('OfferPublished', {
        code: groupCode,
        user: authorUserId,
        data: { offer: offer.id },
      }))
    }

    await publishUrgentOffer('first')

    assert.strictEqual(pushQueue.add.mock.callCount(), 1)
    assert.strictEqual(
      appNotifications.filter(notification => notification.userId === sharedUserId).length,
      1,
    )

    const linkedRelation = sharedRelations.find(
      relation => relation.relationships.member.data.id === linkedMember.id,
    )!
    linkedRelation.attributes.notifications.group = false
    await publishUrgentOffer('second')

    assert.strictEqual(pushQueue.add.mock.callCount(), 1)
    assert.strictEqual(
      appNotifications.filter(notification => notification.userId === sharedUserId).length,
      2,
      'In-app notifications stay enabled when every push preference is off',
    )
  })

  it('excludes users whose members are inactive from community recipients', async () => {
    const groupCode = 'GRP1'
    const members = createMembers(groupCode)
    const authorMember = members[0]
    const authorUserId = getUserIdForMember(authorMember.id)
    const disabledMember = members[1]
    const disabledUserId = getUserIdForMember(disabledMember.id)
    disabledMember.attributes.status = 'disabled'

    const created = new Date()
    const expires = new Date(created)
    expires.setDate(created.getDate() + 2)
    const offer = createPost('offers', {
      id: 'offer-inactive-recipient',
      code: 'OFF-INACTIVE-RECIPIENT',
      groupCode,
      memberId: authorMember.id,
      attributes: {
        title: 'Urgent offer',
        created: created.toISOString(),
        expires: expires.toISOString(),
      },
    })

    await put(createEvent('OfferPublished', {
      code: groupCode,
      user: authorUserId,
      data: { offer: offer.id },
    }))

    assert.strictEqual(appNotifications.length, 4)
    assert.strictEqual(
      appNotifications.some(notification => notification.userId === disabledUserId),
      false,
    )
  })

  it('should ignore an urgent OfferPublished event from an inactive member', async () => {
    const groupCode = 'GRP1'
    createMembers(groupCode)
    const authorMember = db.members[0]
    authorMember.attributes.status = 'disabled'
    const authorUserId = getUserIdForMember(authorMember.id)

    await subscribeToPushNotifications(groupCode, authorUserId)

    const created = new Date()
    const expires = new Date()
    expires.setDate(created.getDate() + 5)

    const offer = createPost('offers', {
      id: 'offer-inactive-member',
      code: 'OFF3',
      groupCode,
      memberId: authorMember.id,
      attributes: {
        title: 'Inactive member offer',
        description: 'This should not produce notifications',
        created: created.toISOString(),
        expires: expires.toISOString(),
      }
    })

    const eventData = createEvent('OfferPublished', {
      code: groupCode,
      user: authorUserId,
      data: { offer: offer.id }
    })

    await put(eventData)

    assert.equal(appNotifications.length, 0)
    assert.equal(pushQueue.add.mock.callCount(), 0)
  })
})
