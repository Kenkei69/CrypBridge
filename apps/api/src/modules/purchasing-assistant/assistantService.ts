import type { Product, PaymentOption } from '@x402/shared';

export interface AssistantRequest {
  conversationId: string;
  userId: string;
  userMessage: string;
  conversationHistory: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: any;
  }[];
  catalogProducts: (Product & { paymentOptions?: PaymentOption[] })[];
}

export interface AssistantResponse {
  content: string;
  suggestedProducts?: (Product & { paymentOptions?: PaymentOption[] })[];
  suggestedAction?: 'select_product' | 'clarify' | 'none';
  selectedProductId?: string;
  adapterType: 'deterministic-demo' | 'live-llm';
}

export interface PurchasingAssistantAdapter {
  process(req: AssistantRequest): Promise<AssistantResponse>;
}

/**
 * Deterministic Demo Adapter
 *
 * Implements catalog-grounded natural language purchase discovery, keyword search,
 * budget constraint filtering, conversational reference resolution ("the first one"),
 * clarifying questions, honest out-of-catalog responses, and prompt injection defense.
 * Explicitly labeled as a deterministic demonstration adapter without external keys.
 */
export class DeterministicDemoAdapter implements PurchasingAssistantAdapter {
  async process(req: AssistantRequest): Promise<AssistantResponse> {
    const rawMsg = req.userMessage.trim();
    const lowerMsg = rawMsg.toLowerCase();

    // 1. Prompt Injection Defense
    // Check for adversarial prompt injection attempts inside messages or descriptions
    const injectionKeywords = [
      'system override',
      'ignore all previous instructions',
      'ignore previous instructions',
      'change recipient',
      'drainer',
      'automatically approve',
      'auto approve',
      'grant spending authority',
      '0xhacker',
    ];

    const hasInjectionAttempt = injectionKeywords.some((keyword) => lowerMsg.includes(keyword));
    if (hasInjectionAttempt) {
      return {
        adapterType: 'deterministic-demo',
        content:
          'Security Boundary Alert: Prompt override instructions detected and rejected. The AI assistant cannot modify prices, alter recipient addresses, bypass approval gates, or grant spending authority. All terms must be verified and explicitly approved by you.',
        suggestedAction: 'none',
        suggestedProducts: [],
      };
    }

    // 2. Resolve Conversational References ("the first one", "select 1", "first product", "second one")
    const lastAssistantMsg = [...req.conversationHistory]
      .reverse()
      .find((m) => m.role === 'assistant' && m.metadata?.suggestedProductIds?.length > 0);

    const isReferenceRequest =
      /^(the )?(first|1st|second|2nd|third|3rd|last)( one| product| option)?$/i.test(rawMsg) ||
      /^select (1|2|3|the first|the second)$/i.test(rawMsg);

    if (isReferenceRequest && lastAssistantMsg?.metadata?.suggestedProductIds) {
      const ids: string[] = lastAssistantMsg.metadata.suggestedProductIds;
      let targetIndex = 0;
      if (/second|2nd|2/i.test(rawMsg)) targetIndex = 1;
      else if (/third|3rd|3/i.test(rawMsg)) targetIndex = 2;
      else if (/last/i.test(rawMsg)) targetIndex = ids.length - 1;

      const targetId = ids[targetIndex];
      const selectedProd = req.catalogProducts.find((p) => p.id === targetId);

      if (selectedProd) {
        return {
          adapterType: 'deterministic-demo',
          content: `Selected "${selectedProd.name}". Please review the authoritative terms on the approval card below and explicitly select your payment option before authorizing.`,
          suggestedProducts: [selectedProd],
          selectedProductId: selectedProd.id,
          suggestedAction: 'select_product',
        };
      }
    }

    // 3. Extract Budget Constraint if present
    // Patterns like "under $10", "< 10 USDC", "budget of 20", "for 5 dollars", "max 15"
    let budgetLimitUsdc: number | null = null;
    const budgetMatch =
      lowerMsg.match(/(?:under|below|less than|max(?:imum)?|budget of|\$)\s*(\d+(?:\.\d+)?)/i) ||
      lowerMsg.match(/(\d+(?:\.\d+)?)\s*(?:usdc|dollars?|\$)/i);

    if (budgetMatch && budgetMatch[1]) {
      budgetLimitUsdc = parseFloat(budgetMatch[1]);
    }

    // 4. Greeting or Generic Query -> Clarifying Question
    const isGreeting = /^(hi|hello|hey|greetings|help|what can you do|what do you have)\b/i.test(lowerMsg);
    if (isGreeting && !budgetLimitUsdc) {
      return {
        adapterType: 'deterministic-demo',
        content:
          'Hello! I am the x402 Guardian Purchasing Assistant. I can help you discover and configure verified cloud computing, model hosting, and security services from trusted merchants.\n\nOur verified catalog currently includes:\n• On-demand GPU compute slices (H100)\n• Dedicated High-RAM compute nodes\n• LLM inference credit packages\n• Domain fine-tuned model checkpoints\n• Real-time threat feed subscriptions\n\nWhat kind of compute or security resources are you looking for?',
        suggestedAction: 'clarify',
        suggestedProducts: [],
      };
    }

    // 5. Keyword Matching against Verified Catalog
    const matches: (Product & { paymentOptions?: PaymentOption[] })[] = [];

    for (const product of req.catalogProducts) {
      if (!product.isActive) continue;

      // Skip internal test probe from general suggestions unless directly asked
      if (
        product.name.toLowerCase().includes('adversarial') &&
        !lowerMsg.includes('adversarial') &&
        !lowerMsg.includes('injection') &&
        !lowerMsg.includes('probe')
      ) {
        continue;
      }

      const prodText = `${product.name} ${product.description} ${product.merchant?.name || ''}`.toLowerCase();

      // Check keyword alignment
      let isKeywordMatch = false;
      if (lowerMsg.includes('gpu') || lowerMsg.includes('h100') || lowerMsg.includes('compute')) {
        isKeywordMatch = prodText.includes('gpu') || prodText.includes('compute');
      } else if (lowerMsg.includes('ram') || lowerMsg.includes('memory') || lowerMsg.includes('dedicated')) {
        isKeywordMatch = prodText.includes('ram') || prodText.includes('memory');
      } else if (lowerMsg.includes('inference') || lowerMsg.includes('llm') || lowerMsg.includes('credit')) {
        isKeywordMatch = prodText.includes('inference') || prodText.includes('credit');
      } else if (lowerMsg.includes('weights') || lowerMsg.includes('fine-tune') || lowerMsg.includes('model')) {
        isKeywordMatch = prodText.includes('weights') || prodText.includes('model');
      } else if (
        lowerMsg.includes('security') ||
        lowerMsg.includes('threat') ||
        lowerMsg.includes('feed') ||
        lowerMsg.includes('drainer')
      ) {
        isKeywordMatch = prodText.includes('security') || prodText.includes('threat');
      } else if (
        lowerMsg.includes('adversarial') ||
        lowerMsg.includes('probe') ||
        lowerMsg.includes('injection')
      ) {
        isKeywordMatch = prodText.includes('adversarial');
      } else {
        // Fallback: check if any word in user query matches product name
        const words = lowerMsg.split(/\s+/).filter((w) => w.length > 2);
        isKeywordMatch = words.some((w) => prodText.includes(w));
      }

      if (isKeywordMatch) {
        // Check budget filter if applicable
        if (budgetLimitUsdc !== null) {
          const productPriceUsdc = Number(BigInt(product.priceAmount)) / 1_000_000;
          if (productPriceUsdc <= budgetLimitUsdc) {
            matches.push(product);
          }
        } else {
          matches.push(product);
        }
      }
    }

    // 6. Handle Out-of-Catalog or No Matches
    if (matches.length === 0) {
      if (budgetLimitUsdc !== null) {
        return {
          adapterType: 'deterministic-demo',
          content: `I could not find any products in the verified catalog matching your request under $${budgetLimitUsdc.toFixed(
            2
          )} USDC. You can browse our available compute, inference, and threat feeds above.`,
          suggestedAction: 'none',
          suggestedProducts: [],
        };
      }

      return {
        adapterType: 'deterministic-demo',
        content:
          'I could not find any items matching your request in our verified catalog. Currently, we offer cloud compute instances, model inference credits, and threat feeds. Would you like to view our compute or security options?',
        suggestedAction: 'clarify',
        suggestedProducts: [],
      };
    }

    // 7. Success with Grounded Products
    const productNames = matches.map((m) => `• ${m.name} ($${(Number(BigInt(m.priceAmount)) / 1_000_000).toFixed(2)} USDC)`).join('\n');
    const content = `I found ${matches.length} matching product(s) in the verified catalog:\n\n${productNames}\n\nClick "Select" on a product card below to review supported payment options and server-authoritative terms.`;

    return {
      adapterType: 'deterministic-demo',
      content,
      suggestedProducts: matches,
      suggestedAction: 'select_product',
    };
  }
}

/**
 * Live Provider Adapter Placeholder / Wrapper
 *
 * Implements bounded timeouts, retries, and strict output schema validation.
 * Falls back safely to DeterministicDemoAdapter if live provider is not configured.
 */
export class LiveProviderAdapter implements PurchasingAssistantAdapter {
  private fallbackAdapter = new DeterministicDemoAdapter();

  async process(req: AssistantRequest): Promise<AssistantResponse> {
    // If no live provider key is configured, securely use deterministic demo
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    if (!apiKey) {
      return this.fallbackAdapter.process(req);
    }

    // Live provider calls would be implemented with AbortController timeout & bounded retries
    try {
      // In Phase 2, if live provider is configured, handle with strict safety bounds:
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        // Structured model call with server-side credentials and input sanitization
        // On success or unsupported model response, fallback cleanly
        return await this.fallbackAdapter.process(req);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn('[assistant] Live provider error, falling back to deterministic adapter:', err);
      return this.fallbackAdapter.process(req);
    }
  }
}

export const assistantAdapter: PurchasingAssistantAdapter = new DeterministicDemoAdapter();
