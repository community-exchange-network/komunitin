import { config } from '../config'
import { userActionTokenPurpose } from './tokens'
import type { SignupContext } from '../users/signup'
import logger from '../utils/logger'
import { getNotificationsToken } from './service-token'

type AuthEventName = 'PasswordResetRequested' | 'ValidationEmailRequested'
type ValidationPurpose =
  | typeof userActionTokenPurpose.emailChange
  | typeof userActionTokenPurpose.emailVerification

export class NotificationsService {
  private static async request(body: string, forceRefresh = false) {
    const token = await getNotificationsToken(forceRefresh)
    return fetch(`${config.NOTIFICATIONS_URL}/events`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${token}`,
      },
      body,
    })
  }

  private static async sendEvent(
    name: AuthEventName,
    userId: string,
    email: string,
    data: Record<string, unknown> = {},
    code: string | null = null,
  ) {
    const body = {
      data: {
        type: 'events',
        attributes: {
          name,
          source: 'auth',
          code,
          time: new Date().toISOString(),
          data: {
            user: userId,
            email,
            ...data,
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
      const serializedBody = JSON.stringify(body)
      let response = await this.request(serializedBody)
      if (response.status === 401) {
        response = await this.request(serializedBody, true)
      }

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

  static async sendValidationEmail(
    userId: string,
    email: string,
    purpose: ValidationPurpose,
    signup?: SignupContext,
  ) {
    const code = signup?.type === 'member' ? signup.groupCode : null
    await this.sendEvent('ValidationEmailRequested', userId, email, {
      purpose,
      signup,
    }, code)
  }
}
