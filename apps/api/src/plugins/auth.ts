import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { jwtVerify, SignJWT } from 'jose';
import { AppError, type AuthenticatedUser } from '@x402/shared';
import type { EnvConfig } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    generateTestToken: (user: Partial<AuthenticatedUser> & { email: string; id?: string }, expiresInSeconds?: number) => Promise<string>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance, opts: { config: EnvConfig }) => {
  const secretKey = new TextEncoder().encode(opts.config.SUPABASE_JWT_SECRET);
  const isProduction = opts.config.APP_ENV === 'production';

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization header. Expected Bearer token.');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw AppError.unauthorized('Bearer token is empty');
    }

    try {
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ['HS256'],
      });

      const sub = payload.sub;
      if (!sub || typeof sub !== 'string') {
        throw AppError.unauthorized('Invalid token: missing subject (user ID) claim');
      }

      const email = typeof payload['email'] === 'string' ? payload['email'] : 'unknown@user.local';
      const role = payload['role'] === 'admin' ? 'admin' : 'authenticated';

      // Securely derive identity strictly from the verified cryptographic token
      request.user = {
        id: sub,
        email,
        role,
        displayName: typeof payload['name'] === 'string' ? payload['name'] : null,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Invalid token';
      const isExpired =
        message.includes('expired') ||
        message.includes('exp') ||
        (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ERR_JWT_EXPIRED');

      if (isExpired) {
        throw AppError.unauthorized('Token has expired');
      }
      throw AppError.unauthorized(`Token verification failed: ${message}`);
    }
  });

  // Test token generator strictly for test and non-production environments
  app.decorate(
    'generateTestToken',
    async (user: Partial<AuthenticatedUser> & { email: string; id?: string }, expiresInSeconds = 3600): Promise<string> => {
      if (isProduction) {
        throw AppError.forbidden('Test token generation is strictly disabled in production environment');
      }

      const userId = user.id || '00000000-0000-0000-0000-000000000001';
      const now = Math.floor(Date.now() / 1000);

      const token = await new SignJWT({
        email: user.email,
        role: user.role || 'authenticated',
        name: user.displayName || user.email.split('@')[0],
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer('supabase-auth-simulated')
        .setAudience('authenticated')
        .setIssuedAt(now)
        .setExpirationTime(now + expiresInSeconds)
        .sign(secretKey);

      return token;
    }
  );
});
