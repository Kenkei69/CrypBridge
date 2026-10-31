export const SUPPORTED_NETWORKS = {
  BASE_SEPOLIA: 'eip155:84532',
  BASE_MAINNET: 'eip155:8453',
  SOLANA_DEVNET: 'solana:devnet',
} as const;

export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[keyof typeof SUPPORTED_NETWORKS];

export const SUPPORTED_SCHEMES = {
  EXACT_PAYMENT_V1: 'exact-payment-v1',
} as const;

export type SupportedScheme = (typeof SUPPORTED_SCHEMES)[keyof typeof SUPPORTED_SCHEMES];

export const SUPPORTED_ASSETS = {
  USDC: 'USDC',
} as const;

export type SupportedAsset = (typeof SUPPORTED_ASSETS)[keyof typeof SUPPORTED_ASSETS];

export const X402_SPECIFICATION_VERSION = 'draft-v1';

export const COMPATIBILITY_MATRIX = {
  specVersion: X402_SPECIFICATION_VERSION,
  networks: [
    {
      id: SUPPORTED_NETWORKS.BASE_SEPOLIA,
      name: 'Base Sepolia Testnet',
      schemes: [SUPPORTED_SCHEMES.EXACT_PAYMENT_V1],
      assets: [SUPPORTED_ASSETS.USDC],
      settlementType: 'simulated-or-testnet',
    },
    {
      id: SUPPORTED_NETWORKS.SOLANA_DEVNET,
      name: 'Solana Devnet',
      schemes: [SUPPORTED_SCHEMES.EXACT_PAYMENT_V1],
      assets: [SUPPORTED_ASSETS.USDC],
      settlementType: 'simulated-or-testnet',
    },
    {
      id: SUPPORTED_NETWORKS.BASE_MAINNET,
      name: 'Base Mainnet',
      schemes: [SUPPORTED_SCHEMES.EXACT_PAYMENT_V1],
      assets: [SUPPORTED_ASSETS.USDC],
      settlementType: 'mainnet',
    },
  ],
} as const;
