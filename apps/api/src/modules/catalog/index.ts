import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { products, merchants, productPaymentOptions } from '@x402/database/schema';
import { CatalogSearchQuerySchema, UuidSchema } from '@x402/shared';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // Helper to fetch payment options for a list of products
  async function attachPaymentOptions(items: any[]) {
    if (items.length === 0) return items;

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

    return items.map((item) => ({
      ...item,
      paymentOptions: optionsByProduct.get(item.id) || [],
    }));
  }

  // GET /api/v1/catalog/products - List active products with trusted merchant info and payment options
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

    const withOptions = await attachPaymentOptions(items);

    return {
      products: withOptions,
      total: withOptions.length,
    };
  });

  // GET /api/v1/catalog/search - Search products with keyword, category, and budget constraints
  app.get('/api/v1/catalog/search', async (request: FastifyRequest) => {
    const parsed = CatalogSearchQuerySchema.safeParse(request.query);
    const query = parsed.success ? parsed.data.query?.toLowerCase() : undefined;
    const maxPrice = parsed.success ? parsed.data.maxPrice : undefined;
    const network = parsed.success ? parsed.data.network : undefined;

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

    const withOptions = await attachPaymentOptions(items);

    let filtered = withOptions;

    // Filter by text query
    if (query && query.trim().length > 0) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.merchant.name.toLowerCase().includes(query)
      );
    }

    // Filter by maxPrice (in USDC base units or decimal number)
    if (maxPrice) {
      let maxBaseUnits: bigint;
      if (maxPrice.includes('.')) {
        maxBaseUnits = BigInt(Math.round(parseFloat(maxPrice) * 1_000_000));
      } else {
        const parsedNum = BigInt(maxPrice);
        // If small number like 10, treat as dollars (10_000_000 base units)
        maxBaseUnits = parsedNum < 10_000n ? parsedNum * 1_000_000n : parsedNum;
      }
      filtered = filtered.filter((p) => BigInt(p.priceAmount) <= maxBaseUnits);
    }

    // Filter by network
    if (network) {
      filtered = filtered.filter((p) =>
        p.paymentOptions?.some((opt: any) => opt.networkIdentifier === network)
      );
    }

    return {
      products: filtered,
      total: filtered.length,
      query: query || null,
    };
  });

  // GET /api/v1/catalog/products/:id/payment-options - Get supported payment options for a product
  app.get<{ Params: { id: string } }>(
    '/api/v1/catalog/products/:id/payment-options',
    async (request) => {
      const productId = UuidSchema.parse(request.params.id);

      const options = await app.db
        .select()
        .from(productPaymentOptions)
        .where(
          and(
            eq(productPaymentOptions.productId, productId),
            eq(productPaymentOptions.isActive, true)
          )
        );

      return {
        paymentOptions: options,
        total: options.length,
      };
    }
  );

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
