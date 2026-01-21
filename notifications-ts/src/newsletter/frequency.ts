
import tz from '@photostructure/tz-lookup';
import { Group } from '../clients/komunitin/types';
import logger from '../utils/logger';
import { localTime } from '../utils/i18n';

const NEWSLETTER_SEND_DAY = 0; // Sunday
const NEWSLETTER_SEND_HOUR = 15; // at 3:30 PM

export const shouldProcessGroup = (group: Group, isManualRun: boolean): boolean => {
  if (isManualRun) return true;

  let timeZone = 'UTC';
  const coords = group.attributes.location?.coordinates;

  if (coords && coords.length === 2 && !(coords[0] === 0 && coords[1] === 0)) {
    try {
      const [lon, lat] = coords;
      timeZone = tz(lat, lon);
    } catch (err) {
      logger.warn({ err, group: group.attributes.code }, 'Failed to determine timezone from coordinates, defaulting to UTC timezone');
    }
  } else {
    logger.warn({ group: group.attributes.code }, 'Group has invalid coordinates, defaulting to UTC timezone');
  }

  // Build a date object in local time zone
  const localDate = localTime(timeZone)
  
  return localDate.getDay() === NEWSLETTER_SEND_DAY && localDate.getHours() === NEWSLETTER_SEND_HOUR;
};

export const shouldSendNewsletter = (frequency: string, lastSentDate: Date | undefined, now: Date = new Date()): boolean => {
  if (!lastSentDate) return true;

  if (frequency === 'daily') {
    return !(lastSentDate.getDate() === now.getDate() &&
        lastSentDate.getMonth() === now.getMonth() &&
        lastSentDate.getFullYear() === now.getFullYear());
  } else if (frequency === 'weekly') {
    // Check if same ISO week
    const getWeek = (d: Date) => {
      const date = new Date(d.getTime());
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
      const week1 = new Date(date.getFullYear(), 0, 4);
      return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };
    if (getWeek(lastSentDate) === getWeek(now) && lastSentDate.getFullYear() === now.getFullYear()) {
      return false;
    }
  } else if (frequency === 'monthly') {
    if (lastSentDate.getMonth() === now.getMonth() && lastSentDate.getFullYear() === now.getFullYear()) {
      return false;
    }
  } else if (frequency === 'quarterly') {
    const getQuarter = (d: Date) => Math.floor((d.getMonth() + 3) / 3);
    if (getQuarter(lastSentDate) === getQuarter(now) && lastSentDate.getFullYear() === now.getFullYear()) {
      return false;
    }
  }
  return true;
};
