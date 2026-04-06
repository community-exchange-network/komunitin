import type { Request, Response, NextFunction } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../config';
import { unauthorized, badRequest } from '../../utils/error';
import { addEvent } from '../event-queue';
import type { EventName } from '../../notifications/events';
import { EVENT_NAME } from '../../notifications/events';
import { serializeEvent } from './events.serialize';

const eventNameValues = Object.values(EVENT_NAME) as [EventName, ...EventName[]];

const createEventSchema = z.object({
  data: z.object({
    type: z.literal('events').optional(),
    attributes: z.object({
      name: z.enum(eventNameValues),
      source: z.string(),
      code: z.string().nullable(),
      time: z.coerce.date(),
      data: z.record(z.string()).default({}),
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
});

/**
 * Basic Auth middleware for the events endpoint.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const eventsAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return next(unauthorized('Missing Basic Auth credentials'));
  }

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf-8');

  const expectedUser = config.NOTIFICATIONS_EVENTS_USERNAME;
  const expectedPass = config.NOTIFICATIONS_EVENTS_PASSWORD;
  const expected = `${expectedUser}:${expectedPass}`;

  const match = decoded.length === expected.length && timingSafeEqual(Buffer.from(decoded), Buffer.from(expected));

  if (!match) {
    return next(unauthorized('Invalid credentials'));
  }

  next();
};

/**
 * POST /events — receive a JSON:API event document and enqueue it.
 */
export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createEventSchema.parse(req.body);
    const { attributes, relationships } = parsed.data;

    const event = {
      id: randomUUID(),
      name: attributes.name,
      source: attributes.source ,
      code: attributes.code,
      time: attributes.time,
      data: attributes.data,
      user: relationships.user.data.id,
    };

    await addEvent(event);

    res.status(201).json({
      data: serializeEvent(event),
    });
    
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
    next(err);
  }
};
