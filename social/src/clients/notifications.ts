import { Buffer } from 'node:buffer'
import { config } from '../config'
import type { AuthContext } from '../server/context'
import logger from '../utils/logger'
import type { Group } from '../features/groups/types'
import type { Member } from '../features/members/types'
import type { Post } from '../features/posts/types'
import { fetchWithRetry } from './utils'

type SocialEventName =
  | 'NeedPublished'
  | 'OfferPublished'
  | 'MemberRequested'
  | 'MemberJoined'
  | 'GroupRequested'
  | 'GroupActivated'

type EventData = Record<string, string>

type EventPayload = {
  data: {
    type: 'events'
    attributes: {
      name: SocialEventName
      source: 'social'
      code: string
      time: string
      data: EventData
    }
    relationships: {
      user: {
        data: {
          type: 'users'
          id: string
        }
      }
    }
  }
}

const notificationsUrl = (path: string): string => {
  return `${config.NOTIFICATIONS_API_URL}${path}`
}

class NotificationsClient {
  constructor(readonly ctx: AuthContext) {}

  private getBasicAuthHeader(): string {
    const credentials = `${config.NOTIFICATIONS_API_USERNAME}:${config.NOTIFICATIONS_API_PASSWORD}`
    return `Basic ${Buffer.from(credentials).toString('base64')}`
  }

  private async sendEvent(name: SocialEventName, code: string, data: EventData): Promise<void> {
    const headers = {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: this.getBasicAuthHeader(),
    }

    const payload: EventPayload = {
      data: {
        type: 'events',
        attributes: {
          name,
          source: 'social',
          code,
          time: new Date().toISOString(),
          data,
        },
        relationships: {
          user: {
            data: {
              type: 'users',
              id: this.ctx.userId,
            },
          },
        },
      },
    }

    try {
      const response = await fetchWithRetry(notificationsUrl('/events'), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = await response.text()
        logger.error({ name, code, status: response.status, body }, 'Failed to send notification event')
      }
    } catch (error) {
      logger.error({ err: error, name, code }, 'Failed to send notification event')
    }
  }

  public async notifyOfferPublished(code: string, post: Pick<Post, 'id'>): Promise<void> {
    await this.sendEvent('OfferPublished', code, { offer: post.id })
  }

  public async notifyNeedPublished(code: string, post: Pick<Post, 'id'>): Promise<void> {
    await this.sendEvent('NeedPublished', code, { need: post.id })
  }

  public async notifyMemberRequested(code: string, member: Pick<Member, 'id'>): Promise<void> {
    await this.sendEvent('MemberRequested', code, { member: member.id })
  }

  public async notifyMemberJoined(code: string, member: Pick<Member, 'id'>): Promise<void> {
    await this.sendEvent('MemberJoined', code, { member: member.id })
  }

  public async notifyGroupRequested(group: Pick<Group, 'code'>): Promise<void> {
    await this.sendEvent('GroupRequested', group.code, { group: group.code })
  }

  public async notifyGroupActivated(group: Pick<Group, 'code'>): Promise<void> {
    await this.sendEvent('GroupActivated', group.code, { group: group.code })
  }
}

export const createNotificationsClient = (ctx: AuthContext) => {
  return new NotificationsClient(ctx)
}
