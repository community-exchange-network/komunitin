import type { Need, Offer } from "../../clients/komunitin/types";
import { config } from "../../config";
import type { TemplatePostItem } from "../../newsletter/types";
import { getTimeAgoParams } from "../../utils/format";
import type { EnrichedMemberEvent, EnrichedMemberHasExpiredPostsEvent, EnrichedMemberRequestedEvent } from "../enriched-events";
import type { MessageContext } from "../messages";
import { excerptPost } from "../messages/post";
import type { EmailTemplateContext, PostEmailTemplateContext } from "./types";
import { ctxCommon } from "./utils";

const DAY = 24 * 60 * 60 * 1000;

const isExpired = (post: Offer | Need): boolean => new Date(post.attributes.expires).getTime() <= Date.now();

const getExpiredPosts = (event: EnrichedMemberHasExpiredPostsEvent): Array<Offer | Need> => {
  const expiredOffers = (event.expiredOffers || []).filter(isExpired);
  const expiredNeeds = (event.expiredNeeds || []).filter(isExpired);
  return [...expiredOffers, ...expiredNeeds].sort(
    (a, b) => new Date(b.attributes.expires).getTime() - new Date(a.attributes.expires).getTime()
  );
};

const buildPostTemplateItem = (event: EnrichedMemberHasExpiredPostsEvent, post: Offer | Need, ctx: MessageContext): TemplatePostItem => {
  const { t } = ctx;
  const typeLabel = post.type === 'offers' ? t('offer') : t('need');
  const title = excerptPost(post);
  const image = post.attributes.images?.[0];
  const expiresAt = new Date(post.attributes.expires);
  const { time, range } = getTimeAgoParams(expiresAt);

  return {
    typeLabel,
    title,
    description: post.attributes.content,
    image,
    expiryLabel: t('emails.expired_posts_expired_ago', { time, range }),
    link: `${config.KOMUNITIN_APP_URL}/groups/${event.code}/${post.type}/${post.attributes.code}/edit`,
    accentColor: post.type === 'offers' ? '#2f7989' : '#9d3130',
  };
};

export const ctxMemberRequestedEmail = (event: EnrichedMemberRequestedEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);

  const memberName = event.member.attributes.name;
  const memberEmail = event.users[0]?.user.attributes.email ?? '';
  const memberTown = event.member.attributes.address?.addressLocality ?? '';

  // Rendered through {{{this}}} in templates/partials/intro.hbs, so force interpolation escaping here.
  const detailLines = [
    t('emails.member_requested_detail_name', {
      memberName,
      interpolation: { escapeValue: true },
    }),
    t('emails.member_requested_detail_email', {
      memberEmail,
      interpolation: { escapeValue: true },
    }),
  ];
  if (memberTown) {
    detailLines.push(t('emails.member_requested_detail_town', {
      memberTown,
      interpolation: { escapeValue: true },
    }));
  }
  const detailsParagraph = detailLines.join('<br/>');

  return {
    ...common,
    subject: t('emails.member_requested_subject', { groupName: common.group.name }),

    label: {
      icon: '🙋',
      iconBg: '#E1F5FE',
      text: t('emails.member_requested_label'),
    },

    greeting: t('emails.hello_admin'),
    paragraphs: [
      t('emails.member_requested_text', {
        memberName,
        groupName: common.group.name,
        interpolation: { escapeValue: true },
      }),
      detailsParagraph,
      t('emails.member_requested_subtext'),
    ],

    cta: {
      main: {
        text: t('emails.member_requested_cta'),
        url: `${common.appUrl}/groups/${common.group.code}/admin/accounts`
      }
    },
    // Rendered through {{{reason}}} in templates/partials/footer.hbs.
    reason: t('emails.reason_admin', {
      groupName: common.group.name,
      appName: common.appName,
      interpolation: { escapeValue: true },
    }),
  };
};

export const ctxWelcomeEmail = (event: EnrichedMemberEvent, ctx: MessageContext): EmailTemplateContext => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);

  const memberName = event.member.attributes.name

  const data = {
    ...common,
    subject: t('emails.welcome_subject', { name: common.group.name }),

    label: {
      icon: '👋',
      iconBg: '#D1FAE5',
      text: t('emails.welcome_label'),
    },

    greeting: t('emails.hello_name', { name: memberName }),
    paragraphs: [
      t('emails.welcome_text_1', {
        groupName: common.group.name,
        code: event.member.attributes.code,
        interpolation: { escapeValue: true },
      }),
      t('emails.welcome_text_2', { appName: common.appName}),
      t('emails.happy_exchange')
    ],
    
    cta: {
      main: {
        text: t('emails.welcome_cta_main'),
        url: `${common.appUrl}/home`
      },
      secondary: {
        text: t('emails.welcome_cta_secondary'),
        url: `${common.appUrl}/groups/${common.group.code}`
      }
    },
  }

  return data
}

export const ctxMemberExpiredPostsEmail = (
  event: EnrichedMemberHasExpiredPostsEvent,
  ctx: MessageContext
): PostEmailTemplateContext | null => {
  const { t } = ctx;
  const common = ctxCommon(event, ctx);

  const expiredPosts = getExpiredPosts(event);
  if (expiredPosts.length === 0) {
    return null;
  }
  const featuredPost = expiredPosts[0];
  // getExpiredPosts already sorts by expiry date desc, so the first one is the last expired post.
  // Check that one of the triggering posts is already expired (user has not adressed the expiration yet).
  const lastExpiredAt = new Date(featuredPost.attributes.expires).getTime();
  const elapsed = Date.now() - lastExpiredAt;
  if (elapsed > 2 * DAY) {
    return null;
  }

  const otherPosts = expiredPosts.slice(1).map(post => buildPostTemplateItem(event, post, ctx));
  const featuredType = featuredPost.type === 'offers' ? t('offer') : t('need');
  const { time, range } = getTimeAgoParams(new Date(featuredPost.attributes.expires));
  const featuredTypePlural = featuredPost.type === 'offers' ? t('offers') : t('needs');

  return {
    ...common,
    subject: t('emails.expired_posts_subject', {
      type: featuredType,
      time,
      range,
      count: expiredPosts.length,
      countMore: expiredPosts.length - 1,
    }),
    label: {
      icon: '⏰',
      iconBg: '#FFF3E0',
      text: t('emails.expired_posts_label'),
    },
    greeting: t('emails.hello_name', { name: event.member.attributes.name }),
    paragraphs: [
      t('emails.expired_posts_text', {
        type: featuredType.toLocaleLowerCase(ctx.locale),
        title: excerptPost(featuredPost),
      }),
      ...(otherPosts.length > 0
        ? [t('emails.expired_posts_other_text', { count: otherPosts.length })]
        : []),
    ],
    cta: {
      main: {
        text: t('emails.expired_posts_cta'),
        url: `${common.appUrl}/groups/${event.code}/${featuredPost.type}/${featuredPost.attributes.code}/edit` 
      },
      secondary: {
        text: t('emails.expired_posts_cta_secondary', { type: featuredTypePlural }),
        url: `${common.appUrl}/groups/${event.code}/${featuredPost.type}`
      }
    },
    postscript: t('emails.expired_posts_postscript'),
    featuredPost: buildPostTemplateItem(event, featuredPost, ctx),
    otherPosts: otherPosts.length > 0 ? otherPosts : undefined,
    otherPostsTitle: otherPosts.length > 0
      ? t('emails.expired_posts_more_title')
      : undefined,
  };
};