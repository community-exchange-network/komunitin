
import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { generateKeys } from '../../mocks/auth'
import { createMember, createMembers, createNeed, createOffer, db, getUserIdForMember, resetDb } from '../../mocks/db'
import handlers from '../../mocks/handlers'
import { mockDb } from '../../mocks/prisma'
import { createQueue } from '../../mocks/queue'
import { mockRedis } from '../../mocks/redis'
import { initInAppChannel } from '../channels/app'
import { EVENT_NAME } from '../events'

const server = setupServer(...handlers)
mockRedis()

// Mock prisma table
const { appNotification: appNotifications } = mockDb()

describe('MembersJoinedDigest notifications', () => {
  let runDigest: () => Promise<void>;

  before(async () => {
    const digestModule = await import('../synthetic/digest-cron')
    const queue = createQueue('synthetic-events') as any
    const { handlers } = digestModule.initDigestCron(queue)
    runDigest = handlers['group-digest-cron']

    initInAppChannel()

    await generateKeys()
    server.listen({ onUnhandledRequest: 'bypass' })

  })

  after(() => {
    server.close()
  })

  const groupCode = 'GRP1'
  let members: any[];
  let recipientMember: any;

  beforeEach(async () => {
    resetDb()
    // Setup base members for tests
    createMembers(groupCode) // creates members
    members = db.members.filter(m => m.relationships.group.data.id === `group-${groupCode}`)
    recipientMember = members[0]
    // Clear notifications
    appNotifications.length = 0
  })

  // Helper to create members with specific created dates
  const createTestMember = (params: {
    name?: string,
    daysAgo?: number,
    minutesAgo?: number,
    description?: string,
    offers?: number,
    needs?: number
  }) => {
    const { name, daysAgo = 1, minutesAgo = 0, description, offers = 0, needs = 0 } = params;
    const created = new Date();
    created.setDate(created.getDate() - daysAgo);
    created.setMinutes(created.getMinutes() - minutesAgo);

    const member = createMember({
      id: `member-test-${Math.random().toString(36).substring(2, 8)}`,
      groupCode,
      name,
      attributes: {
        created: created.toISOString(),
        updated: created.toISOString(),
        description
      }
    });

    const id = member.id;

    for (let i = 0; i < offers; i++) {
      createOffer({
        id: `offer-${id}-${i}`,
        code: `OFF${i}${id.substring(0, 3)}`,
        groupCode,
        memberId: id,
        attributes: {
          name: `Offer ${i + 1}`,
          created: created.toISOString()
        }
      });
    }

    for (let i = 0; i < needs; i++) {
      createNeed({
        id: `need-${id}-${i}`,
        code: `NEED${i}${id.substring(0, 3)}`,
        groupCode,
        memberId: id,
        attributes: {
          name: `Need ${i + 1}`,
          created: created.toISOString()
        }
      });
    }

    return member;
  }

  // --- Fast and Slow Path Tests ---

  it('should send digest if 3+ new members and 2+ days without prior digest (Fast Path)', async () => {
    // 3 new members created 1 day ago
    createTestMember({ daysAgo: 1, name: 'M1' });
    createTestMember({ daysAgo: 1, name: 'M2' });
    createTestMember({ daysAgo: 1, name: 'M3' });

    // Last sent digest > 2 days ago (e.g. 3 days)
    const recipientUserId = getUserIdForMember(recipientMember.id);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    appNotifications.push({
      id: 'old-digest',
      userId: recipientUserId,
      tenantId: groupCode,
      eventName: EVENT_NAME.PostsPublishedDigest,
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    });

    await runDigest();

    const notifications = appNotifications.filter(n => n.userId === recipientUserId && n.id !== 'old-digest');
    assert.equal(notifications.length, 1, 'Should send digest (3 items, >2 days silence)');
    assert.equal(notifications[0].eventName, EVENT_NAME.MembersJoinedDigest);
  })

  it('should NOT send digest if 3+ members but silence < 2 days (Fast Path constraint)', async () => {
    createTestMember({ daysAgo: 0, minutesAgo: 10 });
    createTestMember({ daysAgo: 0, minutesAgo: 20 });
    createTestMember({ daysAgo: 0, minutesAgo: 30 });

    const recipientUserId = getUserIdForMember(recipientMember.id);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    appNotifications.push({
      id: 'old-digest',
      userId: recipientUserId,
      tenantId: groupCode,
      eventName: EVENT_NAME.MembersJoinedDigest,
      createdAt: oneDayAgo,
      updatedAt: oneDayAgo,
    });

    await runDigest();

    const notifications = appNotifications.filter(n => n.userId === recipientUserId && n.id !== 'old-digest');
    assert.equal(notifications.length, 0, 'Should NOT send digest (silence < 2 days)');
  })

  it('should send digest if 1+ member and 7+ days without prior digest (Slow Path)', async () => {
    createTestMember({ daysAgo: 1 });

    const recipientUserId = getUserIdForMember(recipientMember.id);
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    appNotifications.push({
      id: 'old-digest',
      userId: recipientUserId,
      tenantId: groupCode,
      eventName: EVENT_NAME.MembersJoinedDigest,
      createdAt: eightDaysAgo,
      updatedAt: eightDaysAgo,
    });

    await runDigest();

    const notifications = appNotifications.filter(n => n.userId === recipientUserId && n.id !== 'old-digest');
    assert.equal(notifications.length, 1, 'Should send digest (1 item, >7 days silence)');
  })

  // --- Interaction with Posts Digest ---

  it('should deliver the older digest (Member vs Post)', async () => {
    // Both eligible (Slow path for both to be simple)
    // 1 new member, 1 new post.
    createTestMember({ daysAgo: 1 });
    // Create offer from ANOTHER member so recipient receives it
    const otherMember = members[1];
    createOffer({
      id: 'offer-other', code: 'OFFO', groupCode,
      memberId: otherMember.id,
      attributes: { created: new Date(Date.now() - 86400000).toISOString() }
    });

    const recipientUserId = getUserIdForMember(recipientMember.id);

    // Case A: Posts older (more overdue).
    // Last Posts: 10 days ago. Last Members: 8 days ago.

    const tenDaysAgo = new Date(); tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const eightDaysAgo = new Date(); eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    appNotifications.length = 0;
    appNotifications.push({
      id: 'last-posts', userId: recipientUserId, tenantId: groupCode,
      eventName: EVENT_NAME.PostsPublishedDigest, createdAt: tenDaysAgo, updatedAt: tenDaysAgo
    });
    appNotifications.push({
      id: 'last-members', userId: recipientUserId, tenantId: groupCode,
      eventName: EVENT_NAME.MembersJoinedDigest, createdAt: eightDaysAgo, updatedAt: eightDaysAgo
    });

    await runDigest();

    let newSents = appNotifications.filter(n => !['last-posts', 'last-members'].includes(n.id) && n.userId === recipientUserId);
    assert.equal(newSents.length, 1, 'Should send exactly 1 digest');
    assert.equal(newSents[0].eventName, EVENT_NAME.PostsPublishedDigest, 'Should send Posts digest when it is older');

    // Case B: Members older.
    // Last Members: 10 days ago. Last Posts: 8 days ago.
   
    appNotifications.length = 0;
    appNotifications.push({
      id: 'last-posts', userId: recipientUserId, tenantId: groupCode,
      eventName: EVENT_NAME.PostsPublishedDigest, createdAt: eightDaysAgo, updatedAt: eightDaysAgo
    });
    appNotifications.push({
      id: 'last-members', userId: recipientUserId, tenantId: groupCode,
      eventName: EVENT_NAME.MembersJoinedDigest, createdAt: tenDaysAgo, updatedAt: tenDaysAgo
    });

    await runDigest();
    newSents = appNotifications.filter(n => !['last-posts', 'last-members'].includes(n.id) && n.userId === recipientUserId);
    assert.equal(newSents.length, 1);
    assert.equal(newSents[0].eventName, EVENT_NAME.MembersJoinedDigest, 'Should send Members digest when it is older');
  })


  // --- Title & Body Content Tests ---

  it('a) one member with 2+ offers', async () => {
    createTestMember({ name: 'Member A', daysAgo: 1, offers: 2 });

    const recipientUserId = getUserIdForMember(recipientMember.id);

    await runDigest();

    const notif = appNotifications.find(n => n.userId === recipientUserId);
    assert.ok(notif);

    assert.match(notif.title, /Member A/);
    assert.match(notif.body, /Offer 1/);
    assert.match(notif.body, /Offer 2/);
    assert.doesNotMatch(notif.body, /more posts/);
  })

  it('b) one member with 1 offer 1 need', async () => {
    createTestMember({ name: 'Member B', daysAgo: 1, offers: 1, needs: 1 });

    const recipientUserId = getUserIdForMember(recipientMember.id);
    await runDigest();
    const notif = appNotifications.find(n => n.userId === recipientUserId);

    assert.match(notif.title, /Member B/);
    assert.match(notif.body, /Offer · Offer 1/);
    assert.match(notif.body, /Need · /);
  })

  it('c) one member with no offers nor needs but with description', async () => {
    createTestMember({ name: 'Member C', daysAgo: 1, description: 'Simulated description of Member C' });

    const recipientUserId = getUserIdForMember(recipientMember.id);

    await runDigest();
    const notif = appNotifications.find(n => n.userId === recipientUserId);

    assert.match(notif.title, /Member C/);
    assert.match(notif.body, /Simulated description of Member C/);
  })

  it('d) 2 members with just one offer each', async () => {
    createTestMember({ name: 'Member D1', daysAgo: 1, offers: 1 });
    createTestMember({ name: 'Member D2', daysAgo: 1, offers: 1 });

    const recipientUserId = getUserIdForMember(recipientMember.id);

    await runDigest();
    const notif = appNotifications.find(n => n.userId === recipientUserId);

    // Expected Body: 
    const bodyLines = notif.body!.split('\n');
    assert.equal(bodyLines.length, 2);
    assert.match(bodyLines[0], /Offer · Offer 1/);
    assert.match(bodyLines[1], /Offer · Offer 1/);
  })

  it('e) 4 members, only 2 of them with offers', async () => {
    createTestMember({ name: 'M1', daysAgo: 1, offers: 1 });
    createTestMember({ name: 'M2', daysAgo: 1, offers: 1 });
    createTestMember({ name: 'M3', daysAgo: 1 });
    createTestMember({ name: 'M4', daysAgo: 1 });

    const recipientUserId = getUserIdForMember(recipientMember.id);
    
    await runDigest();
    const notif = appNotifications.find(n => n.userId === recipientUserId);

    // Expected Body: M1 offer, M2 offer.
    assert.ok(notif);
    const bodyLines = notif.body!.split('\n');
    assert.equal(bodyLines.length, 2);
    assert.match(bodyLines[0], /Offer · Offer 1/);
    assert.match(bodyLines[1], /Offer · Offer 1/);
  })

  it('f) 4 members with no offers, needs nor description', async () => {
    createTestMember({ name: 'Zero1', daysAgo: 1 });
    createTestMember({ name: 'Zero2', daysAgo: 1 });
    createTestMember({ name: 'Zero3', daysAgo: 1 });
    createTestMember({ name: 'Zero4', daysAgo: 1 });

    const recipientUserId = getUserIdForMember(recipientMember.id);
    
    await runDigest();
    const notif = appNotifications.find(n => n.userId === recipientUserId);

    // Body: check_member_profiles_other
    assert.ok(notif.body);
    // Just ensure it's not empty or crashing
    assert.notEqual(notif.body, '');
  })

})
