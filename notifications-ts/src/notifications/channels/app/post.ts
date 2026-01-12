import { EnrichedPostEvent } from '../../enriched-events';
import { handleNotificationForUsers } from './utils';

const excerptText = (post: any, postType: 'offers' | 'needs'): string => {
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
  // Standard routes for offers and needs
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
