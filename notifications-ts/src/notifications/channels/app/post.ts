import { Member, Need, Offer, User } from '../../../clients/komunitin/types';
import { EnrichedPostEvent, EnrichedPostsPublishedDigestEvent } from '../../enriched-events';
import { handleNotificationForUsers } from './utils';

/**
 * Expiry window (created - expires in days) to consider a post as "urgent".
 */
export const POSTS_URGENT_DAYS = 7;

/**
 * Check if a post is urgent based on its expiry window.
 */
export const isPostUrgent = (post: { attributes: { expires: string; created: string } }): boolean => {
  const expire = new Date(post.attributes.expires);
  const created = new Date(post.attributes.created);
  const windowDays = (expire.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return windowDays <= POSTS_URGENT_DAYS;
};

/**
 * Check if a user is the author of a post.
 */
export const isMemberUser = (user: User, memberId: string): boolean => {
  return user.relationships.members.data.some((m: any) => m.id === memberId);
};

const selectFeaturedPosts = (posts: (Offer | Need)[]): (Offer | Need)[] => {
  const first = posts[0];
  const selected: (Offer | Need)[] = [first];

  const differentMember = posts.filter(
    p => p.relationships.member.data.id !== first.relationships.member.data.id
  );
  const differentType = posts.filter(
    p => p.type !== first.type
  );
  const differentMemberAndType = differentType.filter(
    p => differentMember.some(dm => dm.id === p.id)
  );
  
  if (differentMemberAndType.length > 0) {
    selected.push(differentMemberAndType[0]);
  } else if (differentMember.length > 0) {
    selected.push(differentMember[0]);
  } else if (differentType.length > 0) {
    selected.push(differentType[0]);
  } else if (posts.length > 1) {
    selected.push(posts[1]);
  }

  return selected;
}

export const handlePostsPublishedDigest = async (event: EnrichedPostsPublishedDigestEvent): Promise<void> => {
  const { offers, needs, group, members } = event;
  
  const items = [...offers, ...needs].sort((a, b) => new Date(b.attributes.created).getTime() - new Date(a.attributes.created).getTime());
  
  if (items.length === 0) {
    return;
  }

  const memberMap = new Map(members.map(member => [member.id, member]));

  const getMemberName = (memberId: string): string => {
    return memberMap.get(memberId)!.attributes.name;
  };
  const getMemberImage = (memberId: string): string | undefined => {
    return memberMap.get(memberId)!.attributes.image;
  }

  if (items.length === 1) {
    const post = items[0];
    const member = memberMap.get(post.relationships.member.data.id)!;
    await singlePostPublishedNotification(event, post, member);
  } else {
    const featuredPosts = selectFeaturedPosts(items);
    const featuredMemberIds = [...new Set(featuredPosts.map(p => p.relationships.member.data.id))]; 
    const featuredMemberNames = featuredMemberIds.map(id => getMemberName(id));

    const uniqueMembersCount = memberMap.size;
    const extraMembersCount = uniqueMembersCount - featuredMemberIds.length;

    const extraPostsCount = items.length - featuredPosts.length;
    const image = getMemberImage(featuredMemberIds[0]) ?? group.attributes.image;

    await handleNotificationForUsers(event, event.users, ({ t }) => {
      const title = t('notifications.posts_published_digest_title', {
        names: [
          ...featuredMemberNames,
          ...(extraMembersCount > 0 ? [t('notifications.and_more_members', { count: extraMembersCount })] : []),
        ]
      });
      const bodyLines = featuredPosts.map(post => {
        const type = post.type === 'offers' ? t('offer') : t('need');
        const excerpt = excerptPost(post);
        return `${type} · ${excerpt}`;
      });
      if (extraPostsCount > 0) {
        bodyLines.push(t('notifications.and_more_posts', { count: extraPostsCount }));
      }

      return {
        title,
        body: bodyLines.join('\n'),
        image,
        route: `/home`,
      }
    });
  }
};

export const excerptPost = (post: Offer|Need): string => {
  const text = post.type === 'offers'
    ? `${post.attributes.name} · ${post.attributes.content}`
    : post.attributes.content;

  // Truncate excerpt if too long (e.g. for Need content)
  return text && text.length > 50
    ? text.substring(0, 49) + '…'
    : text;
}

const singlePostPublishedNotification = async (event: EnrichedPostEvent | EnrichedPostsPublishedDigestEvent, post: Offer|Need, member: Member) => {
  
  const excerpt = excerptPost(post);
  const route = `/groups/${event.code}/${post.type}/${post.attributes.code}`;

  await handleNotificationForUsers(event, event.users, ({ t }) => {
    const type = post.type === 'offers' ? t('offer') : t('need');
    return {
      title: t('notifications.new_post_title', { type, name: member.attributes.name }),
      body: t('notifications.new_post_body', { excerpt }),
      image: member.attributes.image ?? event.group.attributes.image,
      route,
    };
  })
};

export const handlePostPublished = async (event: EnrichedPostEvent): Promise<void> => {
  const { post, member } = event;
  // Note that event handler has set event.users to all group users for urgent posts
  // or just the authoring member's users for non-urgent posts.
  await singlePostPublishedNotification(event, post, member);
};

export const handlePostExpired = async (event: EnrichedPostEvent): Promise<void> => {
  const { post, postType, code, group } = event;

  const excerpt = excerptPost(post);
  const route = `/groups/${code}/${postType}/${post.attributes.code}/edit`;

  await handleNotificationForUsers(event, event.users, ({ t }) => {
    const type = postType === 'offers' ? t('offer') : t('need');
    return {
      title: t('notifications.post_expired_title', { type }),
      body: t('notifications.post_expired_body', {
        type,
        excerpt,
      }),
      image: group.attributes.image,
      route,
    }
  });
};

export const handlePostExpiresSoon = async (event: EnrichedPostEvent): Promise<void> => {
  const { post, postType, code, group } = event;

  const excerpt = excerptPost(post);
  const route = `/groups/${code}/${postType}/${post.attributes.code}/edit`;
  const timeToExpiryHours = (new Date(post.attributes.expires).getTime() - Date.now()) / (1000 * 60 * 60);

  if (timeToExpiryHours <= 0 || timeToExpiryHours > 24 * 7) {
    // Not in the "soon" window anymore
    return;
  }

  const range = timeToExpiryHours <= 48 ? 'hour' : 'day';
  const time = range === 'hour'
    ? Math.floor(timeToExpiryHours)
    : Math.floor(timeToExpiryHours / 24);

  await handleNotificationForUsers(event, event.users, ({ t }) => {
    const type = postType === 'offers' ? t('offer') : t('need');
    return {
      title: t('notifications.post_expires_soon_title', { type, time, range }),
      body: t('notifications.post_expires_soon_body', {
        type,
        excerpt
      }),
      image: group.attributes.image,
      route,
    }
  })
}

