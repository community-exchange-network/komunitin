import type { Request, Response, NextFunction } from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import { config } from '../../config';
import { unauthorized, badRequest } from '../../utils/error';
import { addEvent } from '../event-queue';
import type { EventName } from '../../notifications/events';
import { EVENT_NAME } from '../../notifications/events';
import { serializeEvent } from './events.serialize';

const validEventNames = new Set(Object.values(EVENT_NAME));

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
    const body = req.body;
    if (!body?.data) {
      throw badRequest('Missing JSON:API data');
    }

    const { type, attributes, relationships } = body.data;

    if (type !== 'events') {
      throw badRequest(`Invalid resource type: ${type}`);
    }

    if (!attributes?.name || !validEventNames.has(attributes.name)) {
      throw badRequest(`Invalid or missing event name: ${attributes?.name}`);
    }

    if (!relationships?.user?.data?.id) {
      throw badRequest("Missing 'user' relationship");
    }

    // Validate data field is a map of strings
    const rawData = attributes.data ?? {};
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawData)) {
      if (typeof v !== 'string') {
        throw badRequest('Data field must be a map of strings');
      }
      data[k] = v;
    }

    const time = new Date(attributes.time);
    if (isNaN(time.getTime())) {
      throw badRequest('Invalid time format');
    }

    const event = {
      id: randomUUID(),
      name: attributes.name as EventName,
      source: attributes.source ?? '',
      code: attributes.code ?? '',
      time,
      data,
      user: relationships.user.data.id as string,
    };

    await addEvent(event);

    res.status(201).json({
      data: serializeEvent(event),
    });
  } catch (err) {
    next(err);
  }
};
