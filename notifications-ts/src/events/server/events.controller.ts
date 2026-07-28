import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { badRequest } from '../../utils/error'
import { addEvent } from '../event-queue'
import type { AnyNotificationEvent, EventName } from '../../notifications/events'
import { EVENT_NAME } from '../../notifications/events'
import { serializeEvent } from './events.serialize'

const eventNameValues = Object.values(EVENT_NAME) as [EventName, ...EventName[]];
const nullableCodeEventNames = new Set<EventName>([
  EVENT_NAME.ValidationEmailRequested,
  EVENT_NAME.PasswordResetRequested,
])

const createEventSchema = z.object({
  data: z.object({
    type: z.literal('events').optional(),
    attributes: z.object({
      name: z.enum(eventNameValues),
      source: z.string(),
      code: z.string().min(1).nullable(),
      time: z.coerce.date(),
      data: z.record(z.string(), z.unknown()).default({}),
    }).refine((attributes) => !(attributes.code === null && !nullableCodeEventNames.has(attributes.name)), {
        message: 'code is required for this event type',
        path: ['code'],
      }),
    relationships: z.object({
      user: z.object({
        data: z.object({
          type: z.literal('users').optional(),
          id: z.string().min(1),
        }),
      }),
    }),
  }),
})

/**
 * Receive an event from a service and enqueue it.
 */
export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createEventSchema.parse(req.body)
    const { attributes, relationships } = parsed.data

    const event = {
      id: randomUUID(),
      name: attributes.name,
      source: attributes.source,
      code: attributes.code,
      time: attributes.time,
      data: attributes.data,
      user: relationships.user.data.id,
    } as AnyNotificationEvent

    await addEvent(event)

    res.status(201).json({
      data: serializeEvent(event),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      err = badRequest(err.message, {
        cause: err,
        details: {
          errors: err.errors.map(e => ({
            source: e.path,
            message: e.message,
          })),
        },
      })
    }
    next(err)
  }
}
