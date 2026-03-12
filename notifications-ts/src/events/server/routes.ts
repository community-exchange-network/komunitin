import { Router } from 'express';
import { eventsAuth, createEvent } from './events.controller';

const router = Router();

router.post('/events', eventsAuth, createEvent);

export default router;
