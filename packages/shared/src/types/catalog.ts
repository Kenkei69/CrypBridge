export interface Merchant {
  id: string;
  name: string;
  slug: string;
  trustedRecipientAddress: string;
  paymentNetwork: string;
  isTrusted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOption {
  id: string;
  productId: string;
  merchantId: string;
  networkIdentifier: string;
  assetIdentifier: string;
  currency: string;
  amount: string; // Base units integer string, e.g. "5000000"
  decimals: number;
  trustedRecipientAddress: string;
  productVersion: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  priceAmount: string; // Base units (e.g. "5000000" for 5 USDC)
  currency: string;
  assetIdentifier: string;
  networkIdentifier: string;
  isActive: boolean;
  merchant?: Merchant;
  paymentOptions?: PaymentOption[];
  createdAt: string;
  updatedAt: string;
}

export interface TrustedMerchantConfig {
  merchantId: string;
  trustedRecipientAddress: string;
  paymentNetwork: string;
  maxAuthorizedAmount?: string;
  isAllowlisted: boolean;
}
