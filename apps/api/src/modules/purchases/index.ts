import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  purchaseIntents,
  products,
  merchants,
  profiles,
  productPaymentOptions,
  approvalSnapshots,
} from '@x402/database/schema';
import {
  AppError,
  CreateDraftPurchaseIntentSchema,
  SelectPaymentOptionSchema,
  ApprovePurchaseIntentSchema,
  RejectPurchaseIntentSchema,
  UuidSchema,
  type ApprovalPreview,
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

  // Format base units helper
  function formatBaseUnits(amount: string, decimals: number = 6): string {
    try {
      const divisor = 10 ** decimals;
      const val = Number(BigInt(amount)) / divisor;
      return `$${val.toFixed(2)}`;
    } catch {
      return `${amount} units`;
    }
  }

  // POST /api/v1/purchases/intents - Create purchase intent with authoritative payment option
  app.post(
    '/api/v1/purchases/intents',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateDraftPurchaseIntentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const { productId, conversationId, paymentOptionId } = parsed.data;
      const userId = request.user.id;
      await ensureProfile(userId, request.user.email);

      // Verify product and merchant are active and trusted
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

      // Fetch active payment options for this product
      const options = await app.db
        .select()
        .from(productPaymentOptions)
        .where(
          and(
            eq(productPaymentOptions.productId, productId),
            eq(productPaymentOptions.isActive, true)
          )
        );

      let selectedOption = options.find((opt) => opt.id === paymentOptionId);
      if (!selectedOption) {
        // Fallback to default option, or first available option
        selectedOption = options.find((opt) => opt.isDefault) || options[0];
      }

      // Authoritative commercial values derived strictly from backend
      const proposedAmount = selectedOption ? selectedOption.amount : product.priceAmount;
      const currency = selectedOption ? selectedOption.currency : product.currency;
      const assetIdentifier = selectedOption ? selectedOption.assetIdentifier : product.assetIdentifier;
      const networkIdentifier = selectedOption ? selectedOption.networkIdentifier : product.networkIdentifier;
      const selectedOptionId = selectedOption ? selectedOption.id : null;

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute preview expiration

      const [intent] = await app.db
        .insert(purchaseIntents)
        .values({
          userId,
          conversationId: conversationId || null,
          productId: product.id,
          merchantId: product.merchantId,
          selectedPaymentOptionId: selectedOptionId,
          proposedAmount,
          currency,
          assetIdentifier,
          networkIdentifier,
          version: 1,
          status: 'draft',
          expiresAt,
        })
        .returning();

      if (!intent) {
        throw new AppError('Failed to record purchase intent', 'INTERNAL_ERROR', 500);
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
          amount: proposedAmount,
          currency,
          networkIdentifier,
          version: 1,
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
            trustedRecipientAddress: selectedOption?.trustedRecipientAddress || product.trustedRecipientAddress,
          },
          selectedPaymentOption: selectedOption || null,
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
          selectedPaymentOptionId: purchaseIntents.selectedPaymentOptionId,
          proposedAmount: purchaseIntents.proposedAmount,
          currency: purchaseIntents.currency,
          assetIdentifier: purchaseIntents.assetIdentifier,
          networkIdentifier: purchaseIntents.networkIdentifier,
          version: purchaseIntents.version,
          status: purchaseIntents.status,
          rejectionReason: purchaseIntents.rejectionReason,
          idempotencyKey: purchaseIntents.idempotencyKey,
          expiresAt: purchaseIntents.expiresAt,
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
          selectedPaymentOptionId: purchaseIntents.selectedPaymentOptionId,
          proposedAmount: purchaseIntents.proposedAmount,
          currency: purchaseIntents.currency,
          assetIdentifier: purchaseIntents.assetIdentifier,
          networkIdentifier: purchaseIntents.networkIdentifier,
          version: purchaseIntents.version,
          status: purchaseIntents.status,
          rejectionReason: purchaseIntents.rejectionReason,
          idempotencyKey: purchaseIntents.idempotencyKey,
          expiresAt: purchaseIntents.expiresAt,
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

      let selectedOption = null;
      if (intent.selectedPaymentOptionId) {
        const [opt] = await app.db
          .select()
          .from(productPaymentOptions)
          .where(eq(productPaymentOptions.id, intent.selectedPaymentOptionId))
          .limit(1);
        selectedOption = opt || null;
      }

      return { intent: { ...intent, selectedPaymentOption: selectedOption } };
    }
  );

  // PATCH /api/v1/purchases/intents/:id/option - Select or switch payment option
  app.patch<{ Params: { id: string } }>(
    '/api/v1/purchases/intents/:id/option',
    { preHandler: [app.authenticate] },
    async (request) => {
      const intentId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const parsed = SelectPaymentOptionSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }
      const { paymentOptionId } = parsed.data;

      // Fetch intent with ownership check
      const [intent] = await app.db
        .select()
        .from(purchaseIntents)
        .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
        .limit(1);

      if (!intent) {
        throw AppError.notFound('Purchase Intent');
      }

      // Fetch requested payment option and verify it belongs to this product
      const [option] = await app.db
        .select()
        .from(productPaymentOptions)
        .where(
          and(
            eq(productPaymentOptions.id, paymentOptionId),
            eq(productPaymentOptions.productId, intent.productId),
            eq(productPaymentOptions.isActive, true)
          )
        )
        .limit(1);

      if (!option) {
        throw AppError.badRequest('Invalid or inactive payment option for this product');
      }

      const nextVersion = intent.version + 1;
      const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Invalidate any existing active approvals for this intent (sets them to superseded)
      await app.db
        .update(approvalSnapshots)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(approvalSnapshots.purchaseIntentId, intentId),
            eq(approvalSnapshots.status, 'active')
          )
        );

      // Update intent with new option, incremented version, and reset status to pending_approval
      const [updatedIntent] = await app.db
        .update(purchaseIntents)
        .set({
          selectedPaymentOptionId: option.id,
          proposedAmount: option.amount,
          currency: option.currency,
          assetIdentifier: option.assetIdentifier,
          networkIdentifier: option.networkIdentifier,
          version: nextVersion,
          status: 'pending_approval',
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
        .returning();

      await recordAuditEvent(app.db, {
        userId,
        eventType: 'PAYMENT_OPTION_CHANGED',
        actorType: 'user',
        resourceType: 'purchase_intent',
        resourceId: intentId,
        payload: {
          previousOptionId: intent.selectedPaymentOptionId,
          newOptionId: option.id,
          networkIdentifier: option.networkIdentifier,
          amount: option.amount,
          newVersion: nextVersion,
        },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return {
        intent: updatedIntent,
        selectedPaymentOption: option,
      };
    }
  );

  // GET /api/v1/purchases/intents/:id/preview - Get authoritative approval preview
  app.get<{ Params: { id: string } }>(
    '/api/v1/purchases/intents/:id/preview',
    { preHandler: [app.authenticate] },
    async (request) => {
      const intentId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const list = await app.db
        .select({
          intent: purchaseIntents,
          product: products,
          merchant: merchants,
        })
        .from(purchaseIntents)
        .innerJoin(products, eq(purchaseIntents.productId, products.id))
        .innerJoin(merchants, eq(purchaseIntents.merchantId, merchants.id))
        .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
        .limit(1);

      const record = list[0];
      if (!record) {
        throw AppError.notFound('Purchase Intent');
      }

      const { intent, product, merchant } = record;

      // Check expiration
      const now = new Date();
      let isExpired = false;
      if (intent.expiresAt && new Date(intent.expiresAt) < now) {
        isExpired = true;
        if (intent.status === 'pending_approval') {
          await app.db
            .update(purchaseIntents)
            .set({ status: 'expired', updatedAt: now })
            .where(eq(purchaseIntents.id, intentId));
          intent.status = 'expired';
        }
      }

      // Fetch all available payment options for this product
      const availableOptions = await app.db
        .select()
        .from(productPaymentOptions)
        .where(
          and(
            eq(productPaymentOptions.productId, product.id),
            eq(productPaymentOptions.isActive, true)
          )
        );

      let selectedOption = availableOptions.find(
        (opt) => opt.id === intent.selectedPaymentOptionId
      );
      if (!selectedOption) {
        selectedOption = availableOptions.find((opt) => opt.isDefault) || availableOptions[0];
      }

      // Check active approval snapshot if already approved
      const [activeSnapshot] = await app.db
        .select()
        .from(approvalSnapshots)
        .where(
          and(
            eq(approvalSnapshots.purchaseIntentId, intentId),
            eq(approvalSnapshots.status, 'active')
          )
        )
        .limit(1);

      const decimals = selectedOption?.decimals || 6;
      const displayAmount = formatBaseUnits(intent.proposedAmount, decimals);
      const recipientAddress = selectedOption?.trustedRecipientAddress || merchant.trustedRecipientAddress;

      const preview: ApprovalPreview = {
        intentId: intent.id,
        version: intent.version,
        productId: product.id,
        productName: product.name,
        productDescription: product.description,
        merchantId: merchant.id,
        merchantName: merchant.name,
        trustedRecipientAddress: recipientAddress,
        amount: intent.proposedAmount,
        displayAmount,
        assetIdentifier: intent.assetIdentifier,
        currency: intent.currency,
        networkIdentifier: intent.networkIdentifier,
        paymentOptionId: selectedOption?.id || '',
        availablePaymentOptions: availableOptions as any,
        expiresAt: intent.expiresAt ? intent.expiresAt.toISOString() : new Date().toISOString(),
        status: intent.status as any,
        isExpired,
        canApprove: (intent.status === 'draft' || intent.status === 'pending_approval') && !isExpired,
        activeApprovalSnapshot: (activeSnapshot as any) || null,
        simulatedNotice: 'Simulation mode — no payment is executed or signed.',
      };

      return { preview };
    }
  );

  // POST /api/v1/purchases/intents/:id/approve - Atomic, version-bound explicit user approval
  app.post<{ Params: { id: string } }>(
    '/api/v1/purchases/intents/:id/approve',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const intentId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const parsed = ApprovePurchaseIntentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }
      const { expectedVersion, idempotencyKey } = parsed.data;

      // Execute approval atomically inside a transaction with row lock
      const result = await app.db.transaction(async (tx) => {
        // Fetch purchase intent with FOR UPDATE concurrency lock
        const lockedIntents = await tx
          .select()
          .from(purchaseIntents)
          .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
          .for('update');

        const intent = lockedIntents[0];
        if (!intent) {
          throw AppError.notFound('Purchase Intent');
        }

        // Idempotency check: if intent is already approved at this version, return existing snapshot safely
        if (intent.status === 'approved') {
          if (intent.version === expectedVersion) {
            const [existingSnapshot] = await tx
              .select()
              .from(approvalSnapshots)
              .where(
                and(
                  eq(approvalSnapshots.purchaseIntentId, intentId),
                  eq(approvalSnapshots.approvalVersion, expectedVersion)
                )
              )
              .limit(1);

            if (existingSnapshot) {
              return {
                status: 'approved',
                snapshot: existingSnapshot,
                message: 'Purchase approved — payment has not been executed.',
                idempotent: true,
              };
            }
          } else {
            throw AppError.conflict(
              `Intent version mismatch: expected version ${expectedVersion}, but current intent is at version ${intent.version}.`
            );
          }
        }

        // Status checks
        if (intent.status === 'rejected') {
          throw AppError.badRequest('Cannot approve a rejected purchase intent.');
        }

        // Optimistic concurrency check: must match expected version
        if (intent.version !== expectedVersion) {
          throw AppError.conflict(
            `Purchase intent terms have changed (expected version ${expectedVersion}, current version is ${intent.version}). Please review the updated terms.`
          );
        }

        // Expiration check
        const now = new Date();
        if (intent.expiresAt && new Date(intent.expiresAt) < now) {
          await tx
            .update(purchaseIntents)
            .set({ status: 'expired', updatedAt: now })
            .where(eq(purchaseIntents.id, intentId));

          throw AppError.badRequest('Purchase intent preview has expired. Please refresh your selection.');
        }

        // Fetch merchant and product to ensure they remain trusted and active
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, intent.productId))
          .limit(1);

        if (!product || !product.isActive) {
          throw AppError.badRequest('Product is no longer active in the verified catalog.');
        }

        const [merchant] = await tx
          .select()
          .from(merchants)
          .where(eq(merchants.id, intent.merchantId))
          .limit(1);

        if (!merchant || !merchant.isTrusted) {
          throw AppError.forbidden('Merchant is untrusted and cannot receive approvals.');
        }

        // Resolve recipient address from selected payment option
        let recipientAddress = merchant.trustedRecipientAddress;
        if (intent.selectedPaymentOptionId) {
          const [opt] = await tx
            .select()
            .from(productPaymentOptions)
            .where(eq(productPaymentOptions.id, intent.selectedPaymentOptionId))
            .limit(1);
          if (opt?.trustedRecipientAddress) {
            recipientAddress = opt.trustedRecipientAddress;
          }
        }

        // Create immutable ApprovalSnapshot
        const [snapshot] = await tx
          .insert(approvalSnapshots)
          .values({
            userId,
            purchaseIntentId: intent.id,
            productId: intent.productId,
            merchantId: intent.merchantId,
            paymentOptionId: intent.selectedPaymentOptionId || null,
            trustedRecipientAddress: recipientAddress,
            exactAmount: intent.proposedAmount,
            assetIdentifier: intent.assetIdentifier,
            networkIdentifier: intent.networkIdentifier,
            approvalVersion: intent.version,
            schemeParameters: {
              simulation: true,
              approvedBy: userId,
              idempotencyKey: idempotencyKey || null,
              notice: 'Purchase approved — payment has not been executed.',
            },
            status: 'active',
            expiresAt: intent.expiresAt || new Date(Date.now() + 15 * 60 * 1000),
            approvedAt: now,
          })
          .returning();

        if (!snapshot) {
          throw new AppError('Failed to create approval snapshot', 'INTERNAL_ERROR', 500);
        }

        // Update purchase intent to approved status
        await tx
          .update(purchaseIntents)
          .set({
            status: 'approved',
            idempotencyKey: idempotencyKey || intent.idempotencyKey,
            updatedAt: now,
          })
          .where(eq(purchaseIntents.id, intent.id));

        // Record audit event inside transaction
        await recordAuditEvent(tx, {
          userId,
          eventType: 'APPROVAL_SNAPSHOT_CREATED',
          actorType: 'user',
          resourceType: 'approval_snapshot',
          resourceId: snapshot.id,
          payload: {
            purchaseIntentId: intent.id,
            approvalVersion: intent.version,
            amount: intent.proposedAmount,
            assetIdentifier: intent.assetIdentifier,
            networkIdentifier: intent.networkIdentifier,
            trustedRecipientAddress: recipientAddress,
          },
          ipAddress: request.ip || null,
          userAgent: (request.headers['user-agent'] as string) || null,
        });

        return {
          status: 'approved',
          snapshot,
          message: 'Purchase approved — payment has not been executed.',
          idempotent: false,
        };
      });

      return reply.status(200).send(result);
    }
  );

  // POST /api/v1/purchases/intents/:id/reject - Reject purchase intent
  app.post<{ Params: { id: string } }>(
    '/api/v1/purchases/intents/:id/reject',
    { preHandler: [app.authenticate] },
    async (request) => {
      const intentId = UuidSchema.parse(request.params.id);
      const userId = request.user.id;

      const parsed = RejectPurchaseIntentSchema.safeParse(request.body);
      const reason = (parsed.success && parsed.data.reason) ? parsed.data.reason : 'User explicitly rejected terms';

      const [intent] = await app.db
        .select()
        .from(purchaseIntents)
        .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
        .limit(1);

      if (!intent) {
        throw AppError.notFound('Purchase Intent');
      }

      // Invalidate any active approval snapshots
      await app.db
        .update(approvalSnapshots)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(approvalSnapshots.purchaseIntentId, intentId),
            eq(approvalSnapshots.status, 'active')
          )
        );

      const [updatedIntent] = await app.db
        .update(purchaseIntents)
        .set({
          status: 'rejected',
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(purchaseIntents.id, intentId), eq(purchaseIntents.userId, userId)))
        .returning();

      await recordAuditEvent(app.db, {
        userId,
        eventType: 'PURCHASE_INTENT_REJECTED',
        actorType: 'user',
        resourceType: 'purchase_intent',
        resourceId: intentId,
        payload: {
          reason,
          version: intent.version,
        },
        ipAddress: request.ip || null,
        userAgent: (request.headers['user-agent'] as string) || null,
      });

      return {
        status: 'rejected',
        intent: updatedIntent,
      };
    }
  );
}
