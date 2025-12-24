
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
