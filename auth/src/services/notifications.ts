import { config } from '../config'
import logger from '../utils/logger'

type AuthEventName = 'PasswordResetRequested' | 'ValidationEmailRequested'

export class NotificationsService {
  private static getHeaders() {
    const credentials = Buffer.from(`${config.NOTIFICATIONS_EVENTS_USERNAME}:${config.NOTIFICATIONS_EVENTS_PASSWORD}`).toString('base64')
    return {
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Basic ${credentials}`,
    }
  }

  private static async sendEvent(name: AuthEventName, userId: string, email: string) {
    const url = `${config.NOTIFICATIONS_URL}/events`
    const body = {
      data: {
        type: 'events',
        attributes: {
          name,
          source: 'auth',
          code: null,
          time: new Date().toISOString(),
          data: {
            user: userId,
            email,
          },
        },
        relationships: {
          user: {
            data: {
              type: 'users',
              id: userId,
            },
          },
        },
      },
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const text = await response.text()
        logger.error({ name, status: response.status, response: text }, 'Failed to send auth notification event')
        throw new Error(`Failed to send ${name}: ${response.statusText}`)
      }

      logger.info({ name, userId }, 'Sent auth notification event to notifications service')
    } catch (err) {
      logger.error({ err, name }, 'Error sending auth notification event')
      throw err
    }
  }

  static async sendPasswordResetEmail(userId: string, email: string) {
    await this.sendEvent('PasswordResetRequested', userId, email)
  }

  static async sendValidationEmail(userId: string, email: string) {
    await this.sendEvent('ValidationEmailRequested', userId, email)
  }
}
