import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc } from 'drizzle-orm';
import { conversations, messages, profiles, products, merchants, productPaymentOptions } from '@x402/database/schema';
import {
  AppError,
  CreateConversationSchema,
  CreateMessageSchema,
  UuidSchema,
} from '@x402/shared';
import { recordAuditEvent } from '../audit/auditService.js';
import { assistantAdapter } from '../purchasing-assistant/assistantService.js';

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

  // POST /api/v1/conversations/:id/assistant-reply - Generate catalog-grounded assistant reply
  app.post<{ Params: { id: string } }>(
    '/api/v1/conversations/:id/assistant-reply',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const convId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      // Verify conversation ownership
      const [conv] = await app.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))
        .limit(1);

      if (!conv) {
        throw AppError.notFound('Conversation');
      }

      // Fetch message history for context
      const history = await app.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, convId), eq(messages.userId, userId)))
        .orderBy(asc(messages.createdAt));

      const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
      if (!lastUserMsg) {
        throw AppError.badRequest('No user message found to respond to');
      }

      // Fetch active catalog products with payment options
      const rawProducts = await app.db
        .select({
          id: products.id,
          merchantId: products.merchantId,
          name: products.name,
          description: products.description,
          priceAmount: products.priceAmount,
          currency: products.currency,
          assetIdentifier: products.assetIdentifier,
          networkIdentifier: products.networkIdentifier,
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          merchant: {
            id: merchants.id,
            name: merchants.name,
            slug: merchants.slug,
            trustedRecipientAddress: merchants.trustedRecipientAddress,
            paymentNetwork: merchants.paymentNetwork,
            isTrusted: merchants.isTrusted,
          },
        })
        .from(products)
        .innerJoin(merchants, eq(products.merchantId, merchants.id))
        .where(eq(products.isActive, true));

      const allOptions = await app.db
        .select()
        .from(productPaymentOptions)
        .where(eq(productPaymentOptions.isActive, true));

      const optionsByProduct = new Map<string, any[]>();
      for (const opt of allOptions) {
        const list = optionsByProduct.get(opt.productId) || [];
        list.push(opt);
        optionsByProduct.set(opt.productId, list);
      }

      const catalogWithPaymentOptions = rawProducts.map((p: any) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        merchant: {
          ...p.merchant,
          createdAt: '',
          updatedAt: '',
        },
        paymentOptions: optionsByProduct.get(p.id) || [],
      }));

      // Process assistant response
      const assistantRes = await assistantAdapter.process({
        conversationId: convId,
        userId,
        userMessage: lastUserMsg.content,
        conversationHistory: history.map((h) => ({
          role: h.role as any,
          content: h.content,
          metadata: h.metadata,
        })),
        catalogProducts: catalogWithPaymentOptions,
      });

      // Persist assistant message
      const [assistantMsg] = await app.db
        .insert(messages)
        .values({
          conversationId: convId,
          userId,
          role: 'assistant',
          content: assistantRes.content,
          metadata: {
            adapterType: assistantRes.adapterType,
            suggestedAction: assistantRes.suggestedAction,
            suggestedProductIds: assistantRes.suggestedProducts?.map((p) => p.id) || [],
            selectedProductId: assistantRes.selectedProductId || null,
          },
        })
        .returning();

      return reply.status(201).send({
        message: assistantMsg,
        suggestedProducts: assistantRes.suggestedProducts || [],
        selectedProductId: assistantRes.selectedProductId || null,
        adapterType: assistantRes.adapterType,
      });
    }
  );
}
