import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { products, merchants } from '@x402/database/schema';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/catalog/products - List active products with trusted merchant info
  app.get('/api/v1/catalog/products', async () => {
    const items = await app.db
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

    return {
      products: items,
      total: items.length,
    };
  });

  // GET /api/v1/catalog/merchants - List trusted merchants
  app.get('/api/v1/catalog/merchants', async () => {
    const list = await app.db
      .select()
      .from(merchants)
      .where(eq(merchants.isTrusted, true));

    return {
      merchants: list,
      total: list.length,
    };
  });
}
