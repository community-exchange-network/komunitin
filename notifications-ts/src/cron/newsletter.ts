import { runNewsletter } from '../newsletter/service';

export { runNewsletter }; // Re-export for index.ts if needed, or index.ts can import from service directly. 
// However, index.ts currently imports from './cron/newsletter'. 
// Ideally index.ts should import from 'newsletter/service' directly, but to minimize change, we re-export here or just keep this file as entry point.
// Wait, cron job logic in index.ts calls `runNewsletter()`. 
// So this file just needs to export `runNewsletter` which calls the service.

// Actually, better to just re-export or have index.ts point to the new location.
// But the task was to reorganize logic.
// Let's make this file just an export.

