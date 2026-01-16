
import { test, describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupServer } from 'msw/node'
import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import prisma from '../../utils/prisma'
import { db, createOffer, createNeed, createMembers, resetDb, getUserIdForMember } from '../../mocks/db'
import { mockTable } from '../../mocks/prisma'
import { mockRedis } from '../../mocks/redis'
import { EVENT_NAME } from '../events'
import { createMockQueue } from '../../mocks/queue'
import type { Queue } from 'bullmq'
import { initInAppChannel } from '../channels/app'

const server = setupServer(...handlers)
mockRedis()

// Mock prisma table
const appNotifications = mockTable(prisma.appNotification, 'test-notification')

describe('PostsPublishedDigest notifications', () => {
  let worker: { stop: () => Promise<void> } | null = null;
  const queue = createMockQueue()
  let runDigest: () => Promise<void>;

  before(async () => {
    const digestModule = await import('../synthetic/digest-cron')
    const { handlers } = digestModule.initDigestCron(queue as Queue)
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
  let authorMember: any;
  let otherMember: any;

  beforeEach(async () => {
    resetDb()
    // Setup base members for tests
    createMembers(groupCode) // creates members
    members = db.members.filter(m => m.relationships.group.data.id === `group-${groupCode}`)
    authorMember = members[0]
    otherMember = members[1]
    // Clear notifications
    appNotifications.length = 0
  })

  afterEach(async () => {
    if (worker) {
      await worker.stop()
      worker = null
    }
  })

  // Helper to create posts with specific dates
  const createTestPost = (params: { type: 'offer' | 'need', daysAgo?: number, minutesAgo?: number, urgent?: boolean, authorId?: string }) => {
    const { type, daysAgo = 1, minutesAgo = 0, urgent = false, authorId = authorMember.id } = params;
    const created = new Date();
    created.setDate(created.getDate() - daysAgo);
    created.setMinutes(created.getMinutes() - minutesAgo);
    
    const expires = new Date(created);
    // Urgent if window <= 7 days.
    // If urgent=true, expires = created + 5 days.
    // If urgent=false, expires = created + 10 days.
    expires.setDate(created.getDate() + (urgent ? 5 : 10));
    const id = `post-${Math.random().toString(36).substring(7)}`;
    const data = {
      id,
      code: id,
      groupCode,
      memberId: authorId,
      attributes: {
        name: `Test ${type}`,
        content: `Content for ${type}`,
        created: created.toISOString(),
        expires: expires.toISOString(),
      }
    };
    return type === 'offer' ? createOffer(data) : createNeed(data);
  }

  it('should send digest if 3+ pending items and 2+ days without prior digest', async () => {
    // Condition: 3 items, created > 2 days ago? No, created anytime, but SILENCE > 2 days.
    // And 3+ pending items.
    
    // Create 3 non-urgent posts
    createTestPost({ type: 'offer', daysAgo: 1 })
    createTestPost({ type: 'need', daysAgo: 1 })
    createTestPost({ type: 'offer', daysAgo: 0, minutesAgo: 30 })

    await runDigest();

    // Verification
    // Should verify that OTHER users received notification
    const otherUserId = getUserIdForMember(otherMember.id);
    const notifications = appNotifications.filter(n => n.userId === otherUserId);
    assert.equal(notifications.length, 1, 'Should send 1 digest notification to other user');
    
    assert.equal(notifications[0].title, `News from ${authorMember.attributes.name}`);
    assert.equal(notifications[0].body, 
`Offer · Test offer · Content for offer
Need · Content for need
And 1 more`);

    // Author should NOT receive the digest. Note that in production the author would receive 3 
    // individual notifications due to the OfferPublished events but we've not simulated that here.
    const authorUserId = getUserIdForMember(authorMember.id);
    const authorNotifications = appNotifications.filter(n => n.userId === authorUserId);
    assert.equal(authorNotifications.length, 0, 'Author should not receive digest');
  })

  it('should NOT send digest if 3+ items but silence < 2 days (Fast Path constraint)', async () => {
     // Simulate last digest sent 1 day ago
     const otherUserId = getUserIdForMember(otherMember.id);
     const yesterday = new Date();
     yesterday.setDate(yesterday.getDate() - 1);
     
     appNotifications.push({
        id: 'old-digest',
        userId: otherUserId,
        tenantId: groupCode,
        eventName: EVENT_NAME.PostsPublishedDigest,
        createdAt: yesterday,
        updatedAt: yesterday,
     });

     createTestPost({ type: 'offer' });
     createTestPost({ type: 'offer' });
     createTestPost({ type: 'offer' });

     await runDigest();

     // Should NOT send new digest because silence (1 day) < 2 days
     const newNotifications = appNotifications.filter(n => n.userId === otherUserId && n.id !== 'old-digest');
     assert.equal(newNotifications.length, 0, 'Should not send digest early (silence < 2 days)');
  })

  it('should send digest if 1+ item and 7+ days without prior digest (Slow Path)', async () => {
     // Create 1 post
     createTestPost({ type: 'offer' });

     // Case A: Last sent 6 days ago -> No digest (Fast path fails < 3 items, Slow path fails < 7 days)
     const otherUserId = getUserIdForMember(otherMember.id);
     const sixDaysAgo = new Date();
     sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
     
     // Clear notifications to be safe
     appNotifications.length = 0;
     appNotifications.push({
        id: 'old-digest-6',
        userId: otherUserId,
        tenantId: groupCode,
        eventName: EVENT_NAME.PostsPublishedDigest,
        createdAt: sixDaysAgo,
        updatedAt: sixDaysAgo,
     });

     await runDigest();
     let newNotifications = appNotifications.filter(n => n.userId === otherUserId && n.id !== 'old-digest-6');
     assert.equal(newNotifications.length, 0, 'Should not send digest for 1 item if silence < 7 days');

     // Case B: Last sent 8 days ago -> Send digest
     appNotifications.length = 0; // reset
     const eightDaysAgo = new Date();
     eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
     appNotifications.push({
        id: 'old-digest-8',
        userId: otherUserId,
        tenantId: 'GRP1', // use literal or var
        eventName: EVENT_NAME.PostsPublishedDigest,
        createdAt: eightDaysAgo,
        updatedAt: eightDaysAgo,
     });

     await runDigest();
     newNotifications = appNotifications.filter(n => n.userId === otherUserId && n.id !== 'old-digest-8');
     assert.equal(newNotifications.length, 1, 'Should send digest for 1 item if silence > 7 days');
  })

  it('should exclude urgent posts from digest calculation', async () => {
      // Urgent posts should NOT count towards the threshold.
      
      // 2 Urgent posts + 1 Non-Urgent.
      // Total 3.
      // If urgent counted, it would hit "3+ items" fast path (assuming silence ok).
      // But if excluded, we have 1 non-urgent. 1 item -> needs 7 days silence.
      // If we set silence to 5 days, it should NOT send (if only counting non-urgent).
      // If it counted urgent, it WOULD send (3 items, 5 days > 2 days).

      createTestPost({ type: 'offer', urgent: true });
      createTestPost({ type: 'offer', urgent: true });
      createTestPost({ type: 'offer', urgent: false }); // One normal post

      const otherUserId = getUserIdForMember(otherMember.id);
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      
      appNotifications.push({
        id: 'old-digest-5',
        userId: otherUserId,
        tenantId: groupCode,
        eventName: EVENT_NAME.PostsPublishedDigest,
        createdAt: fiveDaysAgo,
        updatedAt: fiveDaysAgo,
     });

     await runDigest();

     const result = appNotifications.filter(n => n.userId === otherUserId && n.id !== 'old-digest-5');
     assert.equal(result.length, 0, 'Urgent posts should be ignored, leaving 1 post with < 7 days silence -> No digest');

     // Now if we add 2 more non-urgent (Total 3 non-urgent), it should trigger (3 items, 5 days > 2 days)
     createTestPost({ type: 'offer', urgent: false });
     createTestPost({ type: 'offer', urgent: false });

     await runDigest();
     const result2 = appNotifications.filter(n => n.userId === otherUserId && n.id !== 'old-digest-5');
     assert.equal(result2.length, 1, 'Should trigger digest when enough NON-urgent posts exist');
  })
});
