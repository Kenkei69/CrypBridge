'use client';

import React from 'react';
import { ShoppingBag, CheckCircle, ExternalLink, Shield } from 'lucide-react';

import type { PaymentOption } from '@x402/shared';

export interface ProductItem {
  id: string;
  name: string;
  description: string;
  priceAmount: string;
  currency: string;
  assetIdentifier: string;
  networkIdentifier: string;
  merchant: {
    id: string;
    name: string;
    slug: string;
    trustedRecipientAddress: string;
    isTrusted: boolean;
  };
  paymentOptions?: PaymentOption[];
}

interface CatalogBrowserProps {
  products: ProductItem[];
  loading: boolean;
  onSelectProduct: (product: ProductItem) => void;
  selectedProductId?: string;
}

export function CatalogBrowser({
  products,
  loading,
  onSelectProduct,
  selectedProductId,
}: CatalogBrowserProps) {
  const formatAmount = (baseUnits: string) => {
    try {
      const num = Number(BigInt(baseUnits)) / 1_000_000;
      return `$${num.toFixed(2)}`;
    } catch {
      return `${baseUnits} units`;
    }
  };

  return (
    <div className="bg-surface/80 border border-gray-800 rounded-xl p-5 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-semibold text-gray-100">Verified Product Catalog</h2>
        </div>
        <span className="text-xs px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded-full font-mono">
          Authoritative Backend Catalog
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Loading catalog items...</div>
      ) : products.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">No products found in catalog.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {products.map((product) => {
            const isSelected = selectedProductId === product.id;
            return (
              <div
                key={product.id}
                onClick={() => onSelectProduct(product)}
                className={`p-4 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-500 bg-blue-950/20 ring-1 ring-blue-500/50'
                    : 'border-gray-800/80 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900/80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-medium text-sm text-gray-200">{product.name}</h3>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-sm font-bold text-emerald-400">
                        {formatAmount(product.priceAmount)}
                      </span>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {product.priceAmount} base units
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">{product.description}</p>
                </div>

                <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-gray-300 font-medium">{product.merchant.name}</span>
                    {product.merchant.isTrusted && (
                      <span title="Trusted Merchant">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-gray-500">
                    {product.merchant.trustedRecipientAddress.substring(0, 6)}...
                    {product.merchant.trustedRecipientAddress.substring(38)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
