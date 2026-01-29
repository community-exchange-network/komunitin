import { Member, Need, Offer } from "../../clients/komunitin/types";
import { EnrichedMemberHasExpiredPostsEvent, EnrichedMembersJoinedDigestEvent } from "../enriched-events";
import { MessageContext, NotificationMessage } from "./types";
import { excerptPost } from "./post";

/**
 * Calculate time ago parameters for i18n relative time formatting
 */
const getTimeAgoParams = (date: Date): { time: number; range: 'day' | 'month' | 'year' } => {
  const msPerDay = 1000 * 60 * 60 * 24;
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / msPerDay);

  if (elapsedDays < 30) {
    return { time: -elapsedDays, range: 'day' };
  }
  if (elapsedDays < 365) {
    return { time: -Math.max(1, Math.floor(elapsedDays / 30)), range: 'month' };
  }
  return { time: -Math.max(1, Math.floor(elapsedDays / 365)), range: 'year' };
};

/**
 * Get member label with city if available
 */
const getMemberCity = (member: Member): string | undefined =>
  member.attributes.location?.name || member.attributes.address?.addressLocality;

const getMemberLabel = (member: Member, ctx: MessageContext): string => {
  const city = getMemberCity(member);
  return city
    ? (ctx.t('notifications.member_from_city', { name: member.attributes.name, city }) as string)
    : member.attributes.name;
};

/**
 * Create excerpt from member description
 */
const excerptMemberDescription = (description?: string) => {
  const text = (description || '').trim();
  return text.length > 50 ? `${text.substring(0, 49)}…` : text;
};

/**
 * Generate message for member with expired posts
 */
export const buildMemberHasExpiredPostsMessage = (
  event: EnrichedMemberHasExpiredPostsEvent,
  ctx: MessageContext
): NotificationMessage | null => {
  const expiredOffers = (event.expiredOffers || []).filter(
    o => new Date(o.attributes.expires).getTime() <= Date.now()
  );
  const expiredNeeds = (event.expiredNeeds || []).filter(
    n => new Date(n.attributes.expires).getTime() <= Date.now()
  );

  const expiredPosts = [...expiredOffers, ...expiredNeeds];
  const totalCount = expiredPosts.length;

  // Double-check we actually have expired items
  if (totalCount <= 0) {
    return null;
  }

  const featured = expiredPosts.reduce((best, current) =>
    new Date(current.attributes.expires).getTime() > new Date(best.attributes.expires).getTime()
      ? current : best
  );
  const featuredType = featured.type;
  const moreCount = Math.max(0, totalCount - 1);

  const remainingOffersCount = expiredOffers.length - (featuredType === 'offers' ? 1 : 0);
  const remainingNeedsCount = expiredNeeds.length - (featuredType === 'needs' ? 1 : 0);

  const route = `/groups/${event.code}/${featuredType}/${featured.attributes.code}/edit`;

  const typeLabel = featuredType === 'offers' ? ctx.t('offer') : ctx.t('need');
  const typeLower = String(typeLabel).toLocaleLowerCase(ctx.locale);
  const excerpt = excerptPost(featured);
  const { time, range } = getTimeAgoParams(new Date(featured.attributes.expires));

  const titleKey = moreCount > 0
    ? 'notifications.member_expired_posts_title_more'
    : 'notifications.member_expired_posts_title';

  const countParts: string[] = [];
  if (remainingOffersCount > 0) {
    countParts.push(ctx.t('notifications.offers_count', { count: remainingOffersCount }) as string);
  }
  if (remainingNeedsCount > 0) {
    countParts.push(ctx.t('notifications.needs_count', { count: remainingNeedsCount }) as string);
  }

  const countsPhrase = countParts.length === 2
    ? (ctx.t('notifications.member_expired_posts_counts_join', { offers: countParts[0], needs: countParts[1] }) as string)
    : (countParts[0] || '');

  const countsSentence = countsPhrase
    ? (ctx.t('notifications.member_expired_posts_counts_sentence', { counts: countsPhrase }) as string)
    : '';

  return {
    title: ctx.t(titleKey, { type: typeLabel, time, range, count: moreCount }) as string,
    body: ctx.t('notifications.member_expired_posts_body', {
      type: typeLower,
      excerpt,
      time,
      range,
      countsSentence,
    }) as string,
    image: event.group.attributes.image,
    route,
  };
};

/**
 * Generate message for members joined digest
 */
export const buildMembersJoinedDigestMessage = (
  event: EnrichedMembersJoinedDigestEvent,
  ctx: MessageContext
): NotificationMessage | null => {
  const { members, offers, needs, group, code } = event;

  if (members.length === 0) {
    return null;
  }

  const memberMap = new Map(members.map(member => [member.id, member]));

  const sortedOffers = [...offers].sort((a, b) =>
    new Date(b.attributes.created).getTime() - new Date(a.attributes.created).getTime()
  );
  const sortedNeeds = [...needs].sort((a, b) =>
    new Date(b.attributes.created).getTime() - new Date(a.attributes.created).getTime()
  );

  const featuredEntries: Array<{
    member: Member;
    kind: 'offer' | 'need' | 'description';
    text: string;
  }> = [];

  const tryFeatureEntry = (memberId: string, kind: 'offer' | 'need' | 'description', post?: Offer | Need) => {
    // Only 2 total entries
    if (featuredEntries.length >= 2) return;
    const member = memberMap.get(memberId);
    // Should not happen, but just for TS safety
    if (!member) return;
    // If 2+ members, only one entry per member
    if (members.length > 1 && featuredEntries.some(entry => entry.member.id === memberId)) return;
    if (kind === 'description' && !member.attributes.description) return;
    // Build text
    const text = kind === 'description' 
      ? excerptMemberDescription(member.attributes.description) 
      : excerptPost(post!);
    
    featuredEntries.push({ member, kind, text });
  };

  for (const offer of sortedOffers) {
    tryFeatureEntry(offer.relationships.member.data.id, 'offer', offer);
  }

  for (const need of sortedNeeds) {
    tryFeatureEntry(need.relationships.member.data.id, 'need', need);
  }

  for (const member of members) {
    tryFeatureEntry(member.id, 'description');
  }
  
  const totalPostCount = offers.length + needs.length;
  const featuredPostCount = featuredEntries.filter(entry => entry.kind === 'offer' || entry.kind === 'need').length;
  const extraPostsCount = totalPostCount - featuredPostCount;
  
  const featuredMembers = featuredEntries.map(entry => entry.member);
  const extraMembersCount = Math.max(0, members.length - featuredMembers.length);

  const route = members.length === 1
    ? `/groups/${code}/members/${members[0].attributes.code}`
    : `/home`;

  const names = featuredMembers.map(member => getMemberLabel(member, ctx));
  if (extraMembersCount > 0) {
    names.push(ctx.t('notifications.and_more_members', { count: extraMembersCount }) as string);
  }

  const title = members.length === 1
    ? ctx.t('notifications.member_joined_title', { name: names[0], groupName: group.attributes.name })
    : ctx.t('notifications.members_joined_digest_title', { names, groupName: group.attributes.name });

  const bodyLines: string[] = [];
  for (const entry of featuredEntries) {
    if (entry.kind === 'description') {
      bodyLines.push(entry.text);
    } else {
      const type = entry.kind === 'offer' ? ctx.t('offer') : ctx.t('need');
      bodyLines.push(`${type} · ${entry.text}`);
    }
  }
  if (extraPostsCount > 0) {
    bodyLines.push(ctx.t('notifications.and_more_posts', { count: extraPostsCount }) as string);
  }
  if (bodyLines.length === 0) {
    if (members.length === 1) {
      bodyLines.push(ctx.t('notifications.check_member_profiles_one'));
    } else {
      bodyLines.push(ctx.t('notifications.check_member_profiles_other'));
    }
  }
  const body = bodyLines.join('\n');

  const image = members.length === 1
    ? members[0].attributes.image || group.attributes.image
    : group.attributes.image;

  return {
    title,
    body,
    image,
    route,
  };
};
