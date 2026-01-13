import { EnrichedPostEvent } from '../../enriched-events';
import { handleNotificationForUsers } from './utils';

export const excerptText = (post: any, postType: 'offers' | 'needs'): string => {
  const content = postType === 'offers'
    ? post.attributes.name
    : post.attributes.content;

  // Truncate excerpt if too long (e.g. for Need content)
  return content && content.length > 50 
    ? content.substring(0, 49) + '…' 
    : content;
}

export const handlePostExpired = async (event: EnrichedPostEvent): Promise<void> => {
  const { post, postType, code, member, group } = event;

  const excerpt = excerptText(post, postType);
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
  const { post, postType, code, member, group } = event;
  
  const excerpt = excerptText(post, postType);
  const route = `/groups/${code}/${postType}/${post.attributes.code}/edit`;
  const timeToExpiryHours = (new Date(post.attributes.expires).getTime() - Date.now()) / (1000 * 60 * 60);
  
  if (timeToExpiryHours <= 0 || timeToExpiryHours > 24*7) {
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

