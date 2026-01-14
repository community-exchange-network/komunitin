import { EnrichedMemberHasExpiredPostsEvent } from "../../enriched-events";
import { handleNotificationForUsers } from "./utils";
import { excerptText } from "./post";

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

export const handleMemberHasExpiredPosts = async (event: EnrichedMemberHasExpiredPostsEvent) => {
  const expiredOffers = (event.expiredOffers || []).filter(o => new Date(o.attributes.expires).getTime() <= Date.now());
  const expiredNeeds = (event.expiredNeeds || []).filter(n => new Date(n.attributes.expires).getTime() <= Date.now());

  const offerCandidates = expiredOffers
    .map(post => ({ post, postType: 'offers' as const, expiresAt: new Date(post.attributes.expires) }))
    .filter(c => !Number.isNaN(c.expiresAt.getTime()));

  const needCandidates = expiredNeeds
    .map(post => ({ post, postType: 'needs' as const, expiresAt: new Date(post.attributes.expires) }))
    .filter(c => !Number.isNaN(c.expiresAt.getTime()));

  const candidates = [...offerCandidates, ...needCandidates];
  const totalCount = candidates.length;

  // Double-check we actually have expired items.
  if (totalCount <= 0) {
    return;
  }

  const featured = candidates.reduce((best, current) =>
    current.expiresAt.getTime() > best.expiresAt.getTime() ? current : best
  );

  const offersCount = offerCandidates.length;
  const needsCount = needCandidates.length;
  const moreCount = Math.max(0, totalCount - 1);

  const remainingOffersCount = offersCount - (featured.postType === 'offers' ? 1 : 0);
  const remainingNeedsCount = needsCount - (featured.postType === 'needs' ? 1 : 0);

  const route = `/groups/${event.code}/${featured.postType}/${featured.post.attributes.code}/edit`;

  await handleNotificationForUsers(event, event.users, ({ t, locale }) => {
    const typeLabel = featured.postType === 'offers' ? t('offer') : t('need');
    const typeLower = String(typeLabel).toLocaleLowerCase(locale);
    const excerpt = excerptText(featured.post, featured.postType);
    const { time, range } = getTimeAgoParams(featured.expiresAt);

    const titleKey = moreCount > 0
      ? 'notifications.member_expired_posts_title_more'
      : 'notifications.member_expired_posts_title';

    const countParts: string[] = [];
    if (remainingOffersCount > 0) {
      countParts.push(t('notifications.offers_count', { count: remainingOffersCount }) as string);
    }
    if (remainingNeedsCount > 0) {
      countParts.push(t('notifications.needs_count', { count: remainingNeedsCount }) as string);
    }

    const countsPhrase = countParts.length === 2
      ? (t('notifications.member_expired_posts_counts_join', { offers: countParts[0], needs: countParts[1] }) as string)
      : (countParts[0] || '');

    const countsSentence = countsPhrase
      ? (t('notifications.member_expired_posts_counts_sentence', { counts: countsPhrase }) as string)
      : '';

    return {
      title: t(titleKey, { type: typeLabel, time, range, count: moreCount }) as string,
      body: t('notifications.member_expired_posts_body', {
        type: typeLower,
        excerpt,
        time,
        range,
        countsSentence,
      }) as string,
      image: event.group.attributes.image,
      route,
    };
  });
};