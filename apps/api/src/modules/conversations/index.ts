import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc } from 'drizzle-orm';
import { conversations, messages, profiles } from '@x402/database/schema';
import {
  AppError,
  CreateConversationSchema,
  CreateMessageSchema,
  UuidSchema,
} from '@x402/shared';
import { recordAuditEvent } from '../audit/auditService.js';

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  // Ensure user profile exists before conversation operations
  async function ensureProfile(userId: string, email: string) {
    const existing = await app.db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (existing.length === 0) {
      await app.db.insert(profiles).values({
        id: userId,
        email,
        displayName: email.split('@')[0],
      });
    }
  }

  // POST /api/v1/conversations - Create owned conversation
  app.post(
    '/api/v1/conversations',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const userId = request.user.id;
      await ensureProfile(userId, request.user.email);

      const [created] = await app.db
        .insert(conversations)
        .values({
          userId, // Authoritative verified user identity
          title: parsed.data.title,
          status: 'active',
        })
        .returning();

      if (!created) {
        throw new AppError('Failed to create conversation', 'INTERNAL_ERROR', 500);
      }

      await recordAuditEvent(app.db, {
        userId,
        eventType: 'CONVERSATION_CREATED',
        actorType: 'user',
        resourceType: 'conversation',
        resourceId: created.id,
        payload: { title: created.title },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return reply.status(201).send({ conversation: created });
    }
  );

  // GET /api/v1/conversations - List owned conversations
  app.get(
    '/api/v1/conversations',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.user.id;

      const list = await app.db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.createdAt));

      return {
        conversations: list,
        total: list.length,
      };
    }
  );

  // GET /api/v1/conversations/:id - Get owned conversation with messages
  app.get<{ Params: { id: string } }>(
    '/api/v1/conversations/:id',
    { preHandler: [app.authenticate] },
    async (request) => {
      const convId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const [conv] = await app.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))
        .limit(1);

      if (!conv) {
        throw AppError.notFound('Conversation');
      }

      const msgList = await app.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, convId), eq(messages.userId, userId)))
        .orderBy(asc(messages.createdAt));

      return {
        conversation: {
          ...conv,
          messages: msgList,
        },
      };
    }
  );

  // POST /api/v1/conversations/:id/messages - Post message to owned conversation
  app.post<{ Params: { id: string } }>(
    '/api/v1/conversations/:id/messages',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const convId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const parsed = CreateMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      // Check conversation ownership
      const [conv] = await app.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))
        .limit(1);

      if (!conv) {
        throw AppError.notFound('Conversation');
      }

      const [msg] = await app.db
        .insert(messages)
        .values({
          conversationId: convId,
          userId,
          role: parsed.data.role,
          content: parsed.data.content,
          metadata: parsed.data.metadata || null,
        })
        .returning();

      if (!msg) {
        throw new AppError('Failed to create message', 'INTERNAL_ERROR', 500);
      }

      await recordAuditEvent(app.db, {
        userId,
        eventType: 'MESSAGE_SENT',
        actorType: 'user',
        resourceType: 'message',
        resourceId: msg.id,
        payload: { conversationId: convId, role: msg.role },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return reply.status(201).send({ message: msg });
    }
  );

  // GET /api/v1/conversations/:id/messages - List messages in owned conversation
  app.get<{ Params: { id: string } }>(
    '/api/v1/conversations/:id/messages',
    { preHandler: [app.authenticate] },
    async (request) => {
      const convId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const [conv] = await app.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))
        .limit(1);

      if (!conv) {
        throw AppError.notFound('Conversation');
      }

      const msgList = await app.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, convId), eq(messages.userId, userId)))
        .orderBy(asc(messages.createdAt));

      return {
        messages: msgList,
        total: msgList.length,
      };
    }
  );
}
