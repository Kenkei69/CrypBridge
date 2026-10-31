import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { type EnvConfig, getConfig } from './config/env.js';
import { getLoggerOptions } from './plugins/logger.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.js';
import { dbPlugin } from './plugins/db.js';
import { healthRoutes } from './modules/health/index.js';
import { authRoutes } from './modules/auth/index.js';
import { catalogRoutes } from './modules/catalog/index.js';
import { conversationRoutes } from './modules/conversations/index.js';
import { purchaseRoutes } from './modules/purchases/index.js';
import { historyRoutes } from './modules/history/index.js';
import { mockMerchantRoutes } from './modules/mock-merchant/index.js';
import { guardianRoutes } from './modules/guardian/index.js';

export async function buildApp(customConfig?: Partial<EnvConfig>): Promise<FastifyInstance> {
  const config = customConfig ? { ...getConfig(), ...customConfig } : getConfig();

  const app: FastifyInstance = fastify({
    logger: getLoggerOptions(config.LOG_LEVEL) as any,
    bodyLimit: 1048576, // 1MB payload limit
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0 && headerId.length <= 64) {
        return headerId;
      }
      return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    },
  });

  // Attach correlation ID to every response header
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Centralized Error Handling
  registerErrorHandler(app);

  // CORS with strict origin validation
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      const isAllowed = config.ALLOWED_ORIGINS.some((allowed) => {
        if (allowed === '*') return true;
        if (allowed === origin) return true;
        // Check wildcard subdomain e.g. https://*.replit.dev
        if (allowed.startsWith('https://*.') || allowed.startsWith('http://*.')) {
          const suffix = allowed.replace(/^https?:\/\/\*\./, '');
          const originHost = new URL(origin).host;
          return originHost.endsWith(suffix);
        }
        return false;
      });

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(new Error(`Origin ${origin} not allowed by CORS policy`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'payment-required',
      'payment-signature',
      'payment-response',
    ],
    exposedHeaders: [
      'x-request-id',
      'payment-required',
      'payment-signature',
      'payment-response',
    ],
  });

  // Global Rate Limiting
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  });

  // Core Plugins
  await app.register(authPlugin, { config });
  await app.register(dbPlugin, { config });

  // Route Modules
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(conversationRoutes);
  await app.register(purchaseRoutes);
  await app.register(historyRoutes, { config });
  await app.register(mockMerchantRoutes);
  await app.register(guardianRoutes);

  return app;
}
