import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { profiles } from '@x402/database/schema';
import { TestTokenRequestSchema } from '@x402/shared';
import { recordAuditEvent } from '../audit/auditService.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/auth/me - returns current verified user profile
  app.get(
    '/api/v1/auth/me',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const authUser = request.user;

      // Fetch or sync profile in database
      const existing = await app.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, authUser.id))
        .limit(1);

      let profile = existing[0];

      if (!profile) {
        // Create initial profile for authenticated identity
        const [inserted] = await app.db
          .insert(profiles)
          .values({
            id: authUser.id,
            email: authUser.email,
            displayName: authUser.displayName || authUser.email.split('@')[0],
          })
          .returning();

        profile = inserted;

        await recordAuditEvent(app.db, {
          userId: authUser.id,
          eventType: 'AUTH_LOGIN',
          actorType: 'user',
          resourceType: 'profile',
          resourceId: authUser.id,
          payload: { email: authUser.email, action: 'initial_profile_created' },
          ipAddress: request.ip || null,
          userAgent: (request.headers['user-agent'] as string) || null,
        });
      }

      return {
        user: {
          id: profile?.id,
          email: profile?.email,
          displayName: profile?.displayName,
          role: authUser.role,
          createdAt: profile?.createdAt,
          updatedAt: profile?.updatedAt,
        },
      };
    }
  );

  // PATCH /api/v1/auth/profile - User profile update (Role changes strictly prohibited)
  app.patch(
    '/api/v1/auth/profile',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const authUser = request.user;
      const body = (request.body as Record<string, unknown>) || {};

      // Security Check: Privileges cannot be self-assigned or escalated via user profile updates
      // Any attempt to submit a 'role' or administrative field is rejected/ignored.
      const updateData: { displayName?: string; updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (typeof body.displayName === 'string' && body.displayName.trim().length > 0) {
        updateData.displayName = body.displayName.trim().substring(0, 80);
      }

      const [updated] = await app.db
        .update(profiles)
        .set(updateData)
        .where(eq(profiles.id, authUser.id))
        .returning();

      await recordAuditEvent(app.db, {
        userId: authUser.id,
        eventType: 'USER_PROFILE_UPDATED',
        actorType: 'user',
        resourceType: 'profile',
        resourceId: authUser.id,
        payload: {
          updatedFields: Object.keys(updateData),
          roleEscalationAttemptIgnored: 'role' in body,
        },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return {
        user: {
          id: updated?.id || authUser.id,
          email: updated?.email || authUser.email,
          displayName: updated?.displayName || authUser.displayName,
          role: authUser.role, // Derived strictly from verified server-issued JWT token, never from request body
          updatedAt: updated?.updatedAt,
        },
      };
    }
  );

  // POST /api/v1/auth/test-token - TEST / DEV ONLY token generation endpoint
  app.post(
    '/api/v1/auth/test-token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
        return reply.status(404).send({ error: { message: 'Not found' } });
      }
      const parsed = TestTokenRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const { email, userId, displayName, expiresInSeconds } = parsed.data;

      const userPayload: { email: string; id?: string; displayName?: string; role: 'authenticated' } = {
        email,
        role: 'authenticated',
      };
      if (userId) userPayload.id = userId;
      if (displayName) userPayload.displayName = displayName;

      const token = await app.generateTestToken(userPayload, expiresInSeconds);

      return reply.status(200).send({
        token,
        tokenType: 'Bearer',
        expiresInSeconds,
        user: {
          id: userId || '00000000-0000-0000-0000-000000000001',
          email,
          displayName: displayName || email.split('@')[0],
        },
      });
    }
  );
}
