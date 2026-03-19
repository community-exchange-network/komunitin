import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { mockDate, restoreDate } from '../../mocks/date'
import { createNeed, createOffer, getUserIdForMember } from '../../mocks/db'
import { createEvent, daysAgo, setupNotificationsTest } from './utils'

const { put, email, appNotifications } = setupNotificationsTest({ useWorker: true })

describe('MemberHasExpiredPostsRecently email notifications', () => {
  afterEach(() => {
    restoreDate()
  })

  it('sends an email for recently expired posts with featured post and additional expired items', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'

    const featuredOffer = createOffer({
      groupCode,
      id: 'offer-email-featured',
      code: 'OFFEMAIL1',
      attributes: {
        name: 'Recent expired offer',
        created: daysAgo(30),
        expires: daysAgo(1),
      },
    })

    const memberId = featuredOffer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    createNeed({
      groupCode,
      id: 'need-email-old-1',
      code: 'NDEMAIL1',
      memberId,
      attributes: {
        content: 'Older expired need',
        expires: daysAgo(5),
      },
    })

    createOffer({
      groupCode,
      id: 'offer-email-old-2',
      code: 'OFFEMAIL2',
      memberId,
      attributes: {
        name: 'Older expired offer',
        expires: daysAgo(10),
      },
    })

    const event = createEvent('MemberHasExpiredPostsRecently', {
      code: groupCode,
      user: userId,
      data: { member: memberId },
    })

    await put(event)

    assert.equal(email.sentEmails.length, 1)
    const sentEmail = email.lastEmail()
    assert.ok(sentEmail.subject.includes('expired'))
    assert.ok(sentEmail.html.includes('Recent expired offer'))
    assert.ok(sentEmail.html.includes('Other expired posts'))
    assert.ok(sentEmail.html.includes('Older expired need'))
    assert.ok(sentEmail.html.includes(featuredOffer.attributes.images?.[0] ?? ''))

    assert.equal(appNotifications.length, 0, 'In-app channel should not handle MemberHasExpiredPostsRecently')
  })

  it('does not send email for MemberHasExpiredPosts event', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'

    const offer = createOffer({
      groupCode,
      id: 'offer-expired',
      code: 'OFFEXPIRED',
      attributes: {
        name: 'Expired offer',
        created: daysAgo(20),
        expires: daysAgo(1),
      },
    })

    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    const event = createEvent('MemberHasExpiredPosts', {
      code: groupCode,
      user: userId,
      data: { member: memberId },
    })

    await put(event)

    assert.equal(email.sentEmails.length, 0)
  })

  it('does not send email when member has no posts expired in last 48h', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'

    const offer = createOffer({
      groupCode,
      id: 'offer-email-stale',
      code: 'OFFSTALE',
      attributes: {
        name: 'Stale expired offer',
        created: daysAgo(40),
        expires: daysAgo(3),
      },
    })

    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    const event = createEvent('MemberHasExpiredPostsRecently', {
      code: groupCode,
      user: userId,
      data: { member: memberId },
    })

    await put(event)

    assert.equal(email.sentEmails.length, 0)
  })
})
