import { Router } from 'express';
import { noAuth } from '../server/auth';
import { asyncHandler } from '../server/handlers';
import { SharedController } from '../controller';
import { MigrationController } from "./migration-controller"
import { MigrationSerializer } from './serialize';
import { context } from '../utils/context';
import { input } from '../server/parse';
import { CreateMigration, migrationStatuses, migrationKinds } from './migration';
import { jsonApiDoc } from '../server/validation';
import { body, checkExact } from 'express-validator';

export function getRoutes(controller: SharedController) {
  const migrationController = new MigrationController(controller)
  const router = Router(); 

  /**
   * List migrations
   */
  router.get('/migrations',
    noAuth(), //TODO
    asyncHandler(async (req, res) => {
      const migrations = await migrationController.getMigrations(context(req))
      const result = await MigrationSerializer.serialize(migrations)
      res.status(200).json(result)
    })
  );

  /**
   * Get a specific migration
   */
  router.get('/migrations/:id',
    noAuth(), //TODO
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      const migration = await migrationController.getMigration(context(req), id);
      res.status(200).json(await MigrationSerializer.serialize(migration));
    })
  );

  /**
   * Stream migration logs (SSE)
   */
  router.get('/migrations/:id/logs/stream',
    noAuth(), //TODO
    async (req, res) => {
      const id = req.params.id;
      
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Send existing logs first
      try {
        const logs = await migrationController.getMigrationLogs(context(req), id);
        logs.forEach(log => {
          res.write(`data: ${JSON.stringify(log)}\n\n`);
        });
      } catch (err) {
        console.error('Error fetching existing logs:', err);
      }

      // Listen for new logs
      const cleanup = migrationController.onLogUpdate(id, (log) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      });

      // Keep connection alive with periodic heartbeat
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);

      // Cleanup on client disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
        cleanup();
      });
    }
  );

  /**
   * Create a migration
   */
  router.post('/migrations',
    noAuth(), //TODO
    checkExact(isCreateMigration()),
    asyncHandler(async (req, res) => {
      const data = input<CreateMigration>(req)
      if (Array.isArray(data)) {
        throw new Error("Expected a single migration object, got an array")
      }
      const migration = await migrationController.createMigration(context(req), data)
      const result = await MigrationSerializer.serialize(migration)
      res.status(201).json(result)
    })
  );

  /**
   * Delete a migration
   */
  router.delete('/migrations/:id',
    noAuth(), //TODO
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      await migrationController.deleteMigration(context(req), id);
      res.status(204).send();
    })
  );

  /**
   * Execute a migration
  */
  router.post('/migrations/:id/play',
    noAuth(), //TODO
    asyncHandler(async (req, res) => {
      const id = req.params.id;
      // Play the migration, but dont wait for it to finish
      migrationController.playMigration(context(req), id);
      res.status(202).send();
    })
  );
  
  return router;
}

const isCreateMigration = () => [
  ...jsonApiDoc("migrations"),
  body("data.attributes.code").isString().notEmpty().isLength({ min: 4 }),
  body("data.attributes.name").isString().notEmpty(),
  body("data.attributes.kind").optional().isString().isIn(migrationKinds),
  body("data.attributes.status").optional().isString().isIn(migrationStatuses),
  body("data.attributes.data").optional().isObject(),
]