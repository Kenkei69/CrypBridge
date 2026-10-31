import { fileURLToPath } from 'node:url';
import { createDatabase } from './client.js';
import { merchants, products } from './schema/index.js';
import { eq } from 'drizzle-orm';

export interface SeedResult {
  merchantsCount: number;
  productsCount: number;
}

export async function runSeed(connectionString?: string): Promise<SeedResult> {
  const { db, close } = createDatabase(connectionString);

  console.log('[seed] Seeding trusted merchants and catalog products...');

  try {
    const seedMerchants = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Cloud Compute Corp',
        slug: 'cloud-compute-corp',
        trustedRecipientAddress: '0x71C8364f3B7147a469f3796A775f0aCe374f514C',
        paymentNetwork: 'eip155:84532',
        isTrusted: true,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Model Host Labs',
        slug: 'model-host-labs',
        trustedRecipientAddress: '0x92DEba7a544E0E84C1Ab257760A81286c478631A',
        paymentNetwork: 'eip155:84532',
        isTrusted: true,
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Secure Data API',
        slug: 'secure-data-api',
        trustedRecipientAddress: '0x3a4bF9e2E2F7730e25B71810fF009aD192a5d93e',
        paymentNetwork: 'eip155:84532',
        isTrusted: true,
      },
    ];

    for (const m of seedMerchants) {
      const existing = await db.select().from(merchants).where(eq(merchants.slug, m.slug));
      if (existing.length === 0) {
        await db.insert(merchants).values(m);
      }
    }

    const seedProducts = [
      {
        id: '44444444-4444-4444-4444-444444444441',
        merchantId: '11111111-1111-1111-1111-111111111111',
        name: 'Cloud GPU 1-Hour Compute',
        description: 'On-demand H100 GPU compute slice for ML model training and inference with high-speed NVLink.',
        priceAmount: '5000000', // 5 USDC (6 decimals: 5 * 10^6)
        currency: 'USDC',
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        isActive: true,
      },
      {
        id: '44444444-4444-4444-4444-444444444442',
        merchantId: '11111111-1111-1111-1111-111111111111',
        name: 'Dedicated High-RAM Node',
        description: '24-hour dedicated high-memory server instance (256 GB ECC RAM, 32 vCPUs).',
        priceAmount: '25000000', // 25 USDC
        currency: 'USDC',
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        isActive: true,
      },
      {
        id: '44444444-4444-4444-4444-444444444443',
        merchantId: '22222222-2222-2222-2222-222222222222',
        name: 'LLM Inference Credit Tier 1',
        description: '10,000 requests to open-weights reasoning models with sub-second latency SLA.',
        priceAmount: '2000000', // 2 USDC
        currency: 'USDC',
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        isActive: true,
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        merchantId: '22222222-2222-2222-2222-222222222222',
        name: 'Fine-Tuned Model Weights Download',
        description: 'Direct S3 high-bandwidth download of domain-specialized weights and checkpoints.',
        priceAmount: '50000000', // 50 USDC
        currency: 'USDC',
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        isActive: true,
      },
      {
        id: '44444444-4444-4444-4444-444444444445',
        merchantId: '33333333-3333-3333-3333-333333333333',
        name: 'Real-Time Security Threat Feed (30-Day)',
        description: 'Continuous malicious address, drainer signature, and phishing domain blocklist subscription.',
        priceAmount: '15000000', // 15 USDC
        currency: 'USDC',
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        isActive: true,
      },
    ];

    for (const p of seedProducts) {
      const existing = await db.select().from(products).where(eq(products.id, p.id));
      if (existing.length === 0) {
        await db.insert(products).values(p);
      }
    }

    const seededMerchants = await db.select().from(merchants);
    const seededProducts = await db.select().from(products);

    console.log(
      `[seed] Seed completed successfully. Merchants: ${seededMerchants.length}, Products: ${seededProducts.length}`
    );

    return {
      merchantsCount: seededMerchants.length,
      productsCount: seededProducts.length,
    };
  } finally {
    await close();
  }
}

// Allow direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed()
    .then(() => {
      console.log('[seed] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] Seed failed:', err);
      process.exit(1);
    });
}
