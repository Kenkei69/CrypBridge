import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createDatabase, type DatabaseInstance } from '@x402/database';
import type { EnvConfig } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseInstance['db'];
    sql: DatabaseInstance['sql'];
  }
}

export const dbPlugin = fp(async (app: FastifyInstance, opts: { config: EnvConfig }) => {
  const database = createDatabase(opts.config.DATABASE_URL);

  app.decorate('db', database.db);
  app.decorate('sql', database.sql);

  app.addHook('onClose', async () => {
    await database.close();
  });
});
