import { eq, and, or } from 'drizzle-orm';
import {
  AppError,
  encodeX402Header,
  decodeX402Header,
  PHASE3_PINNED_EXECUTION,
  type X402V2PaymentRequired,
  type X402V2PaymentPayload,
  type X402V2SettlementResponse,
  type X402V2RequirementItem,
} from '@x402/shared';
import { mockMerchantResources, products, productPaymentOptions, merchants } from '@x402/database/schema';
import { SimulationSettlementEngine } from '../payment-engine/simulationSettlementAdapter.js';

export interface MockMerchantRequest {
  resourceId: string;
  paymentSignatureHeader?: string | null | undefined;
  faultInjection?:
    | 'timeout'
    | 'lost_response'
    | 'settlement_rejected'
    | 'resource_delivery_fail'
    | 'corrupt_requirements'
    | 'price_tamper'
    | undefined;
}

export interface MockMerchantResponse {
  status: 200 | 402;
  headers: Record<string, string>;
  body?: any;
}

/**
 * Controlled Local Mock Merchant Server for Phase 3.
 *
 * Implements the x402 V2 transport protocol:
 * 1. Initial request without payment -> HTTP 402 Payment Required + PAYMENT-REQUIRED header.
 * 2. Retried request with PAYMENT-SIGNATURE -> verifies simulated payment and unlocks demonstration resource.
 */
export class MockMerchantService {
  private readonly db: any;
  private readonly appEnv: string;
  private readonly settlementEngine: SimulationSettlementEngine;

  constructor(db: any, appEnv = 'development') {
    this.db = db;
    this.appEnv = appEnv;
    if (appEnv === 'production' || process.env.NODE_ENV === 'production' || process.env.SIMULATION_MODE === 'false') {
      throw AppError.simulationForbidden('MockMerchantService is strictly prohibited in production');
    }
    this.settlementEngine = new SimulationSettlementEngine(db, appEnv);
  }

  async handleResourceRequest(req: MockMerchantRequest): Promise<MockMerchantResponse> {
    if (this.appEnv === 'production' || process.env.NODE_ENV === 'production' || process.env.SIMULATION_MODE === 'false') {
      throw AppError.simulationForbidden('Cannot process mock merchant resource in production');
    }
    const { resourceId, paymentSignatureHeader, faultInjection } = req;

    // 1. Fetch resource and associated product & merchant
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId);
    const whereClause = isUuid
      ? or(eq(mockMerchantResources.id, resourceId), eq(mockMerchantResources.productId, resourceId))
      : eq(mockMerchantResources.id, resourceId);

    const resourcesList = await this.db
      .select({
        resource: mockMerchantResources,
        product: products,
        merchant: merchants,
      })
      .from(mockMerchantResources)
      .innerJoin(products, eq(mockMerchantResources.productId, products.id))
      .innerJoin(merchants, eq(mockMerchantResources.merchantId, merchants.id))
      .where(whereClause)
      .limit(1);

    if (resourcesList.length === 0) {
      throw AppError.notFound(`Mock Merchant Resource '${resourceId}'`);
    }

    const { resource, product, merchant } = resourcesList[0];

    // Fetch supported payment options for this product
    const options = await this.db
      .select()
      .from(productPaymentOptions)
      .where(and(eq(productPaymentOptions.productId, product.id), eq(productPaymentOptions.isActive, true)));

    // 2. Initial Request: No PAYMENT-SIGNATURE provided -> Return 402 Payment Required
    if (!paymentSignatureHeader) {
      // Test fault injection: Corrupt requirements
      if (faultInjection === 'corrupt_requirements') {
        return {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'payment-required': 'NOT_VALID_BASE64_CORRUPT!@#$',
          },
          body: { error: 'Payment Required', message: 'Paywalled resource' },
        };
      }

      // Map options to x402 V2 Requirement Items
      const accepts: X402V2RequirementItem[] = options.map((opt: any) => {
        let amount = opt.amount;
        if (faultInjection === 'price_tamper') {
          // Fault injection: Merchant returns a different amount to test detection
          amount = (BigInt(opt.amount) + 1000000n).toString();
        }

        return {
          scheme: opt.networkIdentifier === PHASE3_PINNED_EXECUTION.network ? 'exact' : 'exact-payment-v1',
          network: opt.networkIdentifier,
          amount,
          asset: opt.networkIdentifier === PHASE3_PINNED_EXECUTION.network
            ? PHASE3_PINNED_EXECUTION.assetAddress
            : opt.assetIdentifier,
          payTo: opt.trustedRecipientAddress || merchant.trustedRecipientAddress,
          maxTimeoutSeconds: 300,
          extra: {
            productName: product.name,
            currency: opt.currency,
          },
        };
      });

      const paymentRequiredDoc: X402V2PaymentRequired = {
        x402Version: 2,
        error: 'Payment required to access demonstration resource',
        resource: {
          url: `/api/v1/mock-merchant/resources/${resource.id}`,
          description: resource.description,
          mimeType: resource.mimeType,
        },
        accepts,
        extensions: {
          merchantName: merchant.name,
          productId: product.id,
          simulated: true,
        },
      };

      const encodedHeader = encodeX402Header(paymentRequiredDoc);

      return {
        status: 402,
        headers: {
          'content-type': 'application/json',
          'payment-required': encodedHeader,
        },
        body: {
          error: 'Payment Required',
          message: 'This demonstration resource is protected by x402 Guardian simulation paywall.',
          resourceId: resource.id,
        },
      };
    }

    // 3. Retry Request: PAYMENT-SIGNATURE provided -> Verify and Settle Simulation
    let payload: X402V2PaymentPayload;
    try {
      payload = decodeX402Header<X402V2PaymentPayload>(paymentSignatureHeader);
    } catch (err) {
      return {
        status: 402,
        headers: { 'content-type': 'application/json' },
        body: { error: 'Invalid PAYMENT-SIGNATURE header encoding' },
      };
    }

    // Submit payment to simulation settlement engine
    const settlementFault =
      faultInjection === 'timeout'
        ? 'timeout'
        : faultInjection === 'lost_response'
        ? 'lost_response'
        : faultInjection === 'settlement_rejected'
        ? 'settlement_rejected'
        : undefined;

    const settlementResult: X402V2SettlementResponse = await this.settlementEngine.processSettlement(
      payload,
      settlementFault ? { faultInjection: settlementFault } : undefined
    );

    if (!settlementResult.success) {
      const responseHeader = encodeX402Header(settlementResult);
      return {
        status: 402,
        headers: {
          'content-type': 'application/json',
          'payment-response': responseHeader,
        },
        body: {
          error: 'Payment settlement failed',
          details: settlementResult.error,
        },
      };
    }

    // 4. Handle Fault Injection: Resource Delivery Failure after Successful Settlement
    if (faultInjection === 'resource_delivery_fail') {
      const responseHeader = encodeX402Header(settlementResult);
      return {
        status: 402,
        headers: {
          'content-type': 'application/json',
          'payment-response': responseHeader,
        },
        body: {
          error: 'Resource Delivery Failure: Simulation settled, but demonstration resource payload failed to render',
          settlementReference: settlementResult.transactionHash,
          settled: true,
        },
      };
    }

    // 5. Success -> Deliver Demonstration Resource with PAYMENT-RESPONSE
    const responseHeader = encodeX402Header(settlementResult);
    let parsedContent: any = resource.content;
    try {
      parsedContent = JSON.parse(resource.content);
    } catch {
      // String content
    }

    return {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'payment-response': responseHeader,
      },
      body: {
        success: true,
        resourceId: resource.id,
        title: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        deliveredPayload: parsedContent,
        accessGrantedAt: new Date().toISOString(),
        settlementReference: settlementResult.transactionHash,
        notice: 'Demonstration Resource — Simulated purchase completed. No real funds were transferred.',
      },
    };
  }
}
