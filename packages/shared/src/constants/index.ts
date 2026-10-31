export const SUPPORTED_NETWORKS = {
  BASE_SEPOLIA: 'eip155:84532',
  BASE_MAINNET: 'eip155:8453',
  SOLANA_DEVNET: 'solana:devnet',
} as const;

export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[keyof typeof SUPPORTED_NETWORKS];

export const SUPPORTED_SCHEMES = {
  EXACT_PAYMENT_V1: 'exact-payment-v1',
  EXACT_V2: 'exact',
} as const;

export type SupportedScheme = (typeof SUPPORTED_SCHEMES)[keyof typeof SUPPORTED_SCHEMES];

export const SUPPORTED_ASSETS = {
  USDC: 'USDC',
  USDC_BASE_SEPOLIA: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
} as const;

export type SupportedAsset = (typeof SUPPORTED_ASSETS)[keyof typeof SUPPORTED_ASSETS];

export const X402_SPECIFICATION_VERSION = 'draft-v1';
export const X402_V2_SPEC_VERSION = 2;

export const X402_V2_HEADERS = {
  PAYMENT_REQUIRED: 'payment-required',
  PAYMENT_SIGNATURE: 'payment-signature',
  PAYMENT_RESPONSE: 'payment-response',
} as const;

export const PHASE3_PINNED_EXECUTION = {
  version: X402_V2_SPEC_VERSION,
  scheme: SUPPORTED_SCHEMES.EXACT_V2,
  network: SUPPORTED_NETWORKS.BASE_SEPOLIA,
  assetAddress: SUPPORTED_ASSETS.USDC_BASE_SEPOLIA,
  assetSymbol: SUPPORTED_ASSETS.USDC,
  decimals: 6,
  paymentFlow: 'server-402-challenge-then-client-retry',
} as const;

export const EXECUTION_STATUS = {
  QUEUED: 'QUEUED',
  VALIDATING: 'VALIDATING',
  SIMULATING_AUTHORIZATION: 'SIMULATING_AUTHORIZATION',
  SETTLING_SIMULATION: 'SETTLING_SIMULATION',
  SIMULATION_COMPLETED: 'SIMULATION_COMPLETED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELED: 'CANCELED',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
} as const;

export const FULFILLMENT_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
} as const;

export const COMPATIBILITY_MATRIX = {
  specVersion: X402_SPECIFICATION_VERSION,
  v2Version: X402_V2_SPEC_VERSION,
  networks: [
    {
      id: SUPPORTED_NETWORKS.BASE_SEPOLIA,
      name: 'Base Sepolia Testnet',
      schemes: [SUPPORTED_SCHEMES.EXACT_PAYMENT_V1, SUPPORTED_SCHEMES.EXACT_V2],
      assets: [SUPPORTED_ASSETS.USDC, SUPPORTED_ASSETS.USDC_BASE_SEPOLIA],
      settlementType: 'simulated-or-testnet',
      phase3ExecutionSupported: true,
    },
    {
      id: SUPPORTED_NETWORKS.SOLANA_DEVNET,
      name: 'Solana Devnet',
      schemes: [SUPPORTED_SCHEMES.EXACT_PAYMENT_V1],
      assets: [SUPPORTED_ASSETS.USDC],
      settlementType: 'simulated-or-testnet',
      phase3ExecutionSupported: false,
    },
    {
      id: SUPPORTED_NETWORKS.BASE_MAINNET,
      name: 'Base Mainnet',
      schemes: [SUPPORTED_SCHEMES.EXACT_PAYMENT_V1],
      assets: [SUPPORTED_ASSETS.USDC],
      settlementType: 'mainnet',
      phase3ExecutionSupported: false,
    },
  ],
} as const;
