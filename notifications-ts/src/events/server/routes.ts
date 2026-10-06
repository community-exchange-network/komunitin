import { Router } from 'express';
import { createEvent } from './events.controller';
import { eventsAuth } from '../../server/auth';

const router = Router();

router.post('/events', eventsAuth(), createEvent);

export default router;
