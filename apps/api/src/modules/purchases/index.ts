import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { purchaseIntents, products, merchants, profiles } from '@x402/database/schema';
import {
  AppError,
  CreateDraftPurchaseIntentSchema,
  UuidSchema,
} from '@x402/shared';
import { recordAuditEvent } from '../audit/auditService.js';

export async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  // Ensure profile exists helper
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

  // POST /api/v1/purchases/intents - Create draft purchase intent from catalog
  app.post(
    '/api/v1/purchases/intents',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateDraftPurchaseIntentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const { productId, conversationId } = parsed.data;
      const userId = request.user.id;
      await ensureProfile(userId, request.user.email);

      // CRITICAL SECURITY REQUIREMENT:
      // Authoritative pricing, recipient, merchant, asset, and network details
      // MUST be retrieved strictly from backend catalog records.
      // Client-supplied payment amounts and recipients are strictly rejected/ignored.
      const productRecords = await app.db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          priceAmount: products.priceAmount,
          currency: products.currency,
          assetIdentifier: products.assetIdentifier,
          networkIdentifier: products.networkIdentifier,
          isActive: products.isActive,
          merchantId: products.merchantId,
          merchantName: merchants.name,
          trustedRecipientAddress: merchants.trustedRecipientAddress,
          merchantTrusted: merchants.isTrusted,
        })
        .from(products)
        .innerJoin(merchants, eq(products.merchantId, merchants.id))
        .where(eq(products.id, productId))
        .limit(1);

      const product = productRecords[0];
      if (!product || !product.isActive) {
        throw AppError.notFound('Product not found or is currently inactive in catalog');
      }

      if (!product.merchantTrusted) {
        throw AppError.forbidden('Merchant is untrusted and cannot receive purchase intents');
      }

      const [intent] = await app.db
        .insert(purchaseIntents)
        .values({
          userId,
          conversationId: conversationId || null,
          productId: product.id,
          merchantId: product.merchantId,
          proposedAmount: product.priceAmount, // Authoritative catalog price
          currency: product.currency,
          assetIdentifier: product.assetIdentifier,
          networkIdentifier: product.networkIdentifier,
          status: 'draft',
        })
        .returning();

      if (!intent) {
        throw new AppError('Failed to record draft purchase intent', 'INTERNAL_ERROR', 500);
      }

      await recordAuditEvent(app.db, {
        userId,
        eventType: 'PURCHASE_INTENT_CREATED',
        actorType: 'user',
        resourceType: 'purchase_intent',
        resourceId: intent.id,
        payload: {
          productId: product.id,
          productName: product.name,
          merchantId: product.merchantId,
          amount: product.priceAmount,
          currency: product.currency,
        },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return reply.status(201).send({
        intent: {
          ...intent,
          product: {
            id: product.id,
            name: product.name,
            description: product.description,
          },
          merchant: {
            id: product.merchantId,
            name: product.merchantName,
            trustedRecipientAddress: product.trustedRecipientAddress,
          },
        },
      });
    }
  );

  // GET /api/v1/purchases/intents - List owned purchase intents
  app.get(
    '/api/v1/purchases/intents',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.user.id;

      const list = await app.db
        .select({
          id: purchaseIntents.id,
          userId: purchaseIntents.userId,
          conversationId: purchaseIntents.conversationId,
          productId: purchaseIntents.productId,
          merchantId: purchaseIntents.merchantId,
          proposedAmount: purchaseIntents.proposedAmount,
          currency: purchaseIntents.currency,
          assetIdentifier: purchaseIntents.assetIdentifier,
          networkIdentifier: purchaseIntents.networkIdentifier,
          status: purchaseIntents.status,
          createdAt: purchaseIntents.createdAt,
          updatedAt: purchaseIntents.updatedAt,
          product: {
            id: products.id,
            name: products.name,
            description: products.description,
          },
          merchant: {
            id: merchants.id,
            name: merchants.name,
            trustedRecipientAddress: merchants.trustedRecipientAddress,
          },
        })
        .from(purchaseIntents)
        .innerJoin(products, eq(purchaseIntents.productId, products.id))
        .innerJoin(merchants, eq(purchaseIntents.merchantId, merchants.id))
        .where(eq(purchaseIntents.userId, userId))
        .orderBy(desc(purchaseIntents.createdAt));

      return {
        intents: list,
        total: list.length,
      };
    }
  );

  // GET /api/v1/purchases/intents/:id - Get owned purchase intent
  app.get<{ Params: { id: string } }>(
    '/api/v1/purchases/intents/:id',
    { preHandler: [app.authenticate] },
    async (request) => {
      const intentId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const list = await app.db
        .select({
          id: purchaseIntents.id,
          userId: purchaseIntents.userId,
          conversationId: purchaseIntents.conversationId,
          productId: purchaseIntents.productId,
          merchantId: purchaseIntents.merchantId,
          proposedAmount: purchaseIntents.proposedAmount,
          currency: purchaseIntents.currency,
          assetIdentifier: purchaseIntents.assetIdentifier,
          networkIdentifier: purchaseIntents.networkIdentifier,
          status: purchaseIntents.status,
          createdAt: purchaseIntents.createdAt,
          updatedAt: purchaseIntents.updatedAt,
          product: {
            id: products.id,
            name: products.name,
            description: products.description,
          },
          merchant: {
            id: merchants.id,
            name: merchants.name,
            trustedRecipientAddress: merchants.trustedRecipientAddress,
          },
        })
        .from(purchaseIntents)
        .innerJoin(products, eq(purchaseIntents.productId, products.id))
        .innerJoin(merchants, eq(purchaseIntents.merchantId, merchants.id))
        .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
        .limit(1);

      const intent = list[0];
      if (!intent) {
        throw AppError.notFound('Purchase Intent');
      }

      return { intent };
    }
  );
}
