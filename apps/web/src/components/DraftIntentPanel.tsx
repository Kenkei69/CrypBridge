'use client';

import React from 'react';
import { FileCheck, ShieldCheck, Clock, ExternalLink } from 'lucide-react';
import type { PurchaseIntent } from '@x402/shared';

interface DraftIntentPanelProps {
  intents: PurchaseIntent[];
  loading: boolean;
}

export function DraftIntentPanel({ intents, loading }: DraftIntentPanelProps) {
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
          <FileCheck className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-gray-100">Draft Purchase Intents</h2>
        </div>
        <span className="text-xs px-2.5 py-1 bg-blue-950/60 text-blue-400 border border-blue-800/60 rounded-full font-mono">
          Server-Bound Values
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Loading purchase intents...</div>
      ) : intents.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-xs">
          No draft purchase intents created yet. Select a product from the verified catalog above to create an intent.
        </div>
      ) : (
        <div className="space-y-3">
          {intents.map((intent) => (
            <div
              key={intent.id}
              className="p-4 rounded-lg bg-gray-950/50 border border-gray-800/80 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-200">
                      {intent.product?.name || 'Verified Product'}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-950/60 text-amber-400 border border-amber-800/50 uppercase">
                      {intent.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Merchant: {intent.merchant?.name || 'Trusted Partner'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-emerald-400">
                    {formatAmount(intent.proposedAmount)} {intent.currency}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {intent.proposedAmount} base units
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-900 text-[11px] font-mono">
                <div>
                  <span className="text-gray-500">Asset:</span>{' '}
                  <span className="text-gray-300">{intent.assetIdentifier}</span>
                </div>
                <div>
                  <span className="text-gray-500">Network:</span>{' '}
                  <span className="text-gray-300">{intent.networkIdentifier}</span>
                </div>
                <div className="col-span-2 truncate">
                  <span className="text-gray-500">Trusted Recipient:</span>{' '}
                  <span className="text-gray-400">
                    {intent.merchant?.trustedRecipientAddress}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-amber-300/80 bg-amber-950/30 p-2.5 rounded border border-amber-900/40 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Phase 1 Security Gate:</strong> Intent is saved as an immutable draft. Execution and signing require server-side user approval snapshot in Phase 2.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
