import { Member, Need, Offer } from "../../clients/komunitin/types";
import { EnrichedPostEvent, EnrichedPostsPublishedDigestEvent } from "../enriched-events";
import { MessageContext, NotificationActions, NotificationMessage } from "./types";

/**
 * Create an excerpt from a post for use in notification body
 */
export const excerptPost = (post: Offer | Need): string => {
  const text = post.type === 'offers'
    ? post.attributes.name
    : post.attributes.content;

  // Truncate excerpt if too long
  return text && text.length > 40
    ? text.substring(0, 39) + '…'
    : text;
};

/**
 * Calculate new expiry date and duration for extending a post. It is based
 * on the current age of the post (from creation to current expiry).
 * 
 * @param post 
 * @returns 
 */
export const extendPostDuration = (post: Offer | Need): { expire: Date; duration: Intl.Duration } => {
  const currentExpiry = new Date(post.attributes.expires);
  const creation = new Date(post.attributes.created);
  const ageDays = (currentExpiry.getTime() - creation.getTime()) / (1000 * 60 * 60 * 24);
  
  const expire = new Date(Math.max(currentExpiry.getTime(), Date.now()));

  const duration: Intl.Duration = {};
  if (ageDays <= 7) {
    duration.days = 7;
    expire.setDate(expire.getDate() + 7);
  } else if (ageDays <= 30) {
    duration.months = 1;
    expire.setMonth(expire.getMonth() + 1);
  } else if (ageDays <= 180) {
    duration.months = 6;
    expire.setMonth(expire.getMonth() + 6);
  } else {
    duration.years = 1;
    expire.setFullYear(expire.getFullYear() + 1);
  }
  return { expire, duration };
};


/**
 * Select featured posts for digest notifications
 */
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
};

/**
 * Generate message for a single published post
 */
export const buildSinglePostPublishedMessage = (
  event: EnrichedPostEvent | EnrichedPostsPublishedDigestEvent,
  post: Offer | Need,
  member: Member,
  { t }: MessageContext
): NotificationMessage => {
  const excerpt = excerptPost(post);
  const route = `/groups/${event.code}/${post.type}/${post.attributes.code}`;

  const type = post.type === 'offers' ? t('offer') : t('need');
  
  return {
    title: t('notifications.new_post_title', { type, name: member.attributes.name }),
    body: t('notifications.new_post_body', { excerpt }),
    image: member.attributes.image ?? event.group.attributes.image,
    route,
    actions: [
      {
        title: t('notifications.action_view'),
        action: NotificationActions.OPEN_ROUTE,
      }
    ],
  };
};

/**
 * Generate message for posts published digest (handles both single and multiple posts)
 */
export const buildPostsPublishedDigestMessage = (
  event: EnrichedPostsPublishedDigestEvent,
  ctx: MessageContext
): NotificationMessage | null => {
  const { offers, needs, group, members } = event;
  
  const items = [...offers, ...needs].sort(
    (a, b) => new Date(b.attributes.created).getTime() - new Date(a.attributes.created).getTime()
  );

  if (items.length === 0) {
    return null;
  }

  const memberMap = new Map(members.map(member => [member.id, member]));

  // Handle single post case
  if (items.length === 1) {
    const post = items[0];
    const member = memberMap.get(post.relationships.member.data.id)!;
    return buildSinglePostPublishedMessage(event, post, member, ctx);
  }

  const { t } = ctx;

  // Handle multiple posts case
  const getMemberName = (memberId: string): string => {
    return memberMap.get(memberId)!.attributes.name;
  };
  const getMemberImage = (memberId: string): string | undefined => {
    return memberMap.get(memberId)!.attributes.image;
  };

  const featuredPosts = selectFeaturedPosts(items);
  const featuredMemberIds = [...new Set(featuredPosts.map(p => p.relationships.member.data.id))]; 
  const featuredMemberNames = featuredMemberIds.map(id => getMemberName(id));

  const uniqueMembersCount = memberMap.size;
  const extraMembersCount = uniqueMembersCount - featuredMemberIds.length;
  const extraPostsCount = items.length - featuredPosts.length;
  const image = getMemberImage(featuredMemberIds[0]) ?? group.attributes.image;

  const title = t('notifications.posts_published_digest_title', {
    names: [
      ...featuredMemberNames,
      ...(extraMembersCount > 0 ? [t('notifications.and_more_members', { count: extraMembersCount })] : []),
    ]
  });

  const bodyLines = featuredPosts.map(post => {
    const type = post.type === 'offers' ? t('offer') : t('need');
    const excerpt = excerptPost(post);
    return `• ${type} · ${excerpt}`;
  });

  if (extraPostsCount > 0) {
    bodyLines.push(`• ${t('notifications.and_more_posts', { count: extraPostsCount })}`);
  }

  return {
    title,
    body: bodyLines.join('\n'),
    image,
    route: `/home`,
    actions: [
      {
        title: t('notifications.action_view_all'),
        action: NotificationActions.OPEN_ROUTE,
      }
    ],
  };
};

/**
 * Generate message for expired post
 */
export const buildPostExpiredMessage = (
  event: EnrichedPostEvent,
  { t }: MessageContext
): NotificationMessage => {
  const { post, postType, code, group } = event;

  const excerpt = excerptPost(post);
  const route = `/groups/${code}/${postType}/${post.attributes.code}/edit`;
  const type = postType === 'offers' ? t('offer') : t('need');

  const { expire, duration } = extendPostDuration(post);

  return {
    title: t('notifications.post_expired_title', { type }),
    body: t('notifications.post_expired_body', { type, excerpt }),
    image: group.attributes.image,
    route,
    actions: [
      {
        title: t('notifications.action_view'),
        action: NotificationActions.OPEN_ROUTE,
      },
      {
        title: t('notifications.action_extend', { duration }),
        action: NotificationActions.EXTEND_POST,
      },
      {
        title: t('notifications.action_hide'),
        action: NotificationActions.HIDE_POST,
      }
    ],
    data: {
      postId: post.id,
      extendTo: expire.toISOString(),
    },
  };
};

/**
 * Generate message for post expiring soon
 */
export const buildPostExpiresSoonMessage = (
  event: EnrichedPostEvent,
  { t }: MessageContext
): NotificationMessage | null => {
  const { post, postType, code, group } = event;

  const timeToExpiryHours = (new Date(post.attributes.expires).getTime() - Date.now()) / (1000 * 60 * 60);

  if (timeToExpiryHours <= 0 || timeToExpiryHours > 24 * 7) {
    // Not in the "soon" window anymore
    return null;
  }

  const range = timeToExpiryHours <= 48 ? 'hour' : 'day';
  const time = range === 'hour'
    ? Math.floor(timeToExpiryHours)
    : Math.floor(timeToExpiryHours / 24);

  const excerpt = excerptPost(post);
  const { expire, duration } = extendPostDuration(post)
  const route = `/groups/${code}/${postType}/${post.attributes.code}/edit`;
  const type = postType === 'offers' ? t('offer') : t('need');

  return {
    title: t('notifications.post_expires_soon_title', { type, time, range }),
    body: t('notifications.post_expires_soon_body', { type, excerpt }),
    image: group.attributes.image,
    route,
    actions: [
    {
      title: t('notifications.action_view'),
      action: NotificationActions.OPEN_ROUTE,
    },
    {
      title: t('notifications.action_extend', { duration }),
      action: NotificationActions.EXTEND_POST,
    },{
      title: t('notifications.action_hide'),
      action: NotificationActions.HIDE_POST,
    }],
    data: {
      postId: post.id,
      extendTo: expire.toISOString(),
    },
  };
};
